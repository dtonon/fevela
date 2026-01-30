import { BIG_RELAY_URLS, DEFAULT_RELAY_LIST, ExtendedKind } from '@/constants'
import { isValidPubkey } from '@/lib/pubkey'
import { tagNameEquals } from '@/lib/tag'
import { isLocalNetworkUrl, normalizeUrl } from '@/lib/url'
import { ISigner, TPublishOptions, TRelayList, TMutedList, TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import FlexSearch from 'flexsearch'
import { EventTemplate, NostrEvent, validateEvent, VerifiedEvent } from '@nostr/tools/wasm'
import { Filter, matchFilters } from '@nostr/tools/filter'
import * as nip19 from '@nostr/tools/nip19'
import * as kinds from '@nostr/tools/kinds'
import { AbstractRelay } from '@nostr/tools/abstract-relay'
import { pool } from '@nostr/gadgets/global'
import indexedDb from './indexed-db.service'
import {
  loadNostrUser,
  NostrUser,
  nostrUserFromEvent,
  NostrUserRequest
} from '@nostr/gadgets/metadata'
import {
  loadRelayList,
  loadFollowsList,
  loadMuteList,
  loadFavoriteRelays
} from '@nostr/gadgets/lists'
import { loadRelaySets } from '@nostr/gadgets/sets'
import z from 'zod'
import { isHex32 } from '@nostr/gadgets/utils'
import { verifyEvent } from '@nostr/tools/wasm'
import { current, outbox, ready } from './outbox.service'
import { SubCloser } from '@nostr/tools/abstract-pool'
import { binarySearch } from '@nostr/tools/utils'
import { seenOn } from '@nostr/gadgets/redstore'
import { outboxFilterRelayBatch } from '@nostr/gadgets/outbox'
import { debounce } from '@/lib/utils'
import { store } from './store.service'

class ClientService extends EventTarget {
  static instance: ClientService

  signer?: ISigner
  pubkey?: string
  followings?: Set<string>

  private trendingNotesCache: NostrEvent[] | null = null

  private userIndex = new FlexSearch.Index({
    tokenize: 'forward'
  })

  constructor() {
    super()
  }

  public static getInstance(): ClientService {
    if (!ClientService.instance) {
      ClientService.instance = new ClientService()
      ClientService.instance.init()
    }
    return ClientService.instance
  }

  async init() {
    try {
      ;(await indexedDb.getAllProfiles()).forEach((profile) => {
        this.addUsernameToIndex(profile)
      })
    } catch (err) {
      console.debug('no profiles to index?', err)
    }
  }

  async determineTargetRelays(
    event: NostrEvent,
    { specifiedRelayUrls, additionalRelayUrls }: TPublishOptions = {}
  ) {
    if (event.kind === kinds.Report) {
      const targetEventId = event.tags.find(tagNameEquals('e'))?.[1]
      if (targetEventId) {
        return this.getSeenEventRelayUrls(targetEventId)
      }
    }

    let relays: string[]
    if (specifiedRelayUrls?.length) {
      relays = specifiedRelayUrls
    } else {
      const _additionalRelayUrls: string[] = additionalRelayUrls ?? []
      if (
        !specifiedRelayUrls?.length &&
        event.kind !== kinds.Contacts &&
        event.kind !== kinds.Mutelist
      ) {
        const mentions: string[] = []
        event.tags.forEach(([tagName, tagValue]) => {
          if (
            ['p', 'P'].includes(tagName) &&
            !!tagValue &&
            isValidPubkey(tagValue) &&
            !mentions.includes(tagValue)
          ) {
            mentions.push(tagValue)
          }
        })
        if (mentions.length > 0) {
          const relayLists = await this.fetchRelayLists(mentions)
          relayLists.forEach((relayList) => {
            _additionalRelayUrls.push(...relayList.read.slice(0, 4))
          })
        }
      }
      if (
        [
          kinds.RelayList,
          kinds.Contacts,
          ExtendedKind.FAVORITE_RELAYS,
          ExtendedKind.BLOSSOM_SERVER_LIST,
          ExtendedKind.RELAY_REVIEW
        ].includes(event.kind)
      ) {
        _additionalRelayUrls.push(...BIG_RELAY_URLS)
      }

      const relayList = await this.fetchRelayList(event.pubkey)
      relays = (relayList?.write.slice(0, 10) ?? []).concat(
        Array.from(new Set(_additionalRelayUrls)) ?? []
      )
    }

    if (!relays.length) {
      relays.push(...BIG_RELAY_URLS)
    }

    return relays
  }

  async publishEvent(relayUrls: string[], event: NostrEvent) {
    const uniqueRelayUrls = Array.from(new Set(relayUrls.map(normalizeUrl)))
    await new Promise<void>((resolve, reject) => {
      let successCount = 0
      let finishedCount = 0
      const errors: { url: string; error: any }[] = []
      Promise.allSettled(
        uniqueRelayUrls.map(async (url) => {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const that = this
          const relay = await pool.ensureRelay(url)
          relay.publishTimeout = 10_000 // 10s
          return relay
            .publish(event)
            .then(() => {
              this.trackEventSeenOn(event.id, relay)
              successCount++
            })
            .catch((error) => {
              if (
                error instanceof Error &&
                error.message.startsWith('auth-required') &&
                !!that.signer
              ) {
                return relay
                  .auth((authEvt: EventTemplate) => that.signer!.signEvent(authEvt))
                  .then(() => relay.publish(event))
              } else {
                errors.push({ url, error })
              }
            })
            .finally(() => {
              // If one third of the relays have accepted the event, consider it a success
              const isSuccess = successCount >= uniqueRelayUrls.length / 3
              if (isSuccess) {
                this.emitNewEvent(event)
                resolve()
              }
              if (++finishedCount >= uniqueRelayUrls.length) {
                reject(
                  new AggregateError(
                    errors.map(
                      ({ url, error }) =>
                        new Error(
                          `${url}: ${error instanceof Error ? error.message : String(error)}`
                        )
                    )
                  )
                )
              }
            })
        })
      )
    })
  }

  emitNewEvent(event: NostrEvent) {
    this.dispatchEvent(new CustomEvent('newEvent', { detail: event }))
    this.addEventToCache(event)
  }

  async signHttpAuth(url: string, method: string, description = '') {
    if (!this.signer) {
      throw new Error('Please login first to sign the event')
    }
    const event = await this.signer?.signEvent({
      content: description,
      kind: kinds.HTTPAuth,
      created_at: dayjs().unix(),
      tags: [
        ['u', url],
        ['method', method]
      ]
    })
    return 'Nostr ' + btoa(JSON.stringify(event))
  }

  /** =========== Timeline =========== */

  subscribeTimeline(
    subRequests: TFeedSubRequest[],
    filterModification: Filter,
    {
      onEvents,
      onNew,
      onClose
    }: {
      onEvents: (events: NostrEvent[], isFinal: boolean) => void
      onNew: (evt: NostrEvent) => void
      onClose?: (url: string, reason: string) => void
    },
    {
      startLogin
    }: {
      startLogin?: () => void
    } = {}
  ): SubCloser {
    let subc: SubCloser
    const abort = new AbortController()

    const localFilters = subRequests
      .filter((req): req is Extract<TFeedSubRequest, { source: 'local' }> => req.source === 'local')
      .map(({ filter }) => ({
        ...filter,
        ...filterModification
      }))

    const relayRequests = subRequests
      .filter(
        (req): req is Extract<TFeedSubRequest, { source: 'relays' }> => req.source === 'relays'
      )
      .map(({ urls, filter }) => ({
        urls,
        filter: {
          ...filter,
          ...filterModification
        }
      }))

    // do local db requests
    let localSyncCallback: () => void
    let localNewCallback: (_: NostrEvent) => void
    const local: Promise<[NostrEvent[], NostrEvent | undefined, string[]]> =
      localFilters.length === 0
        ? Promise.resolve([[], undefined, []])
        : (async () => {
            let newestEvent: NostrEvent | undefined

            // query from local db
            let events: NostrEvent[] = []
            for (let i = 0; i < localFilters.length; i++) {
              events = await store.queryEvents(localFilters[i], 5_000)
              const first = events[0]

              if (first) {
                if (!newestEvent || newestEvent.created_at < first.created_at) {
                  newestEvent = first
                }
              }
            }

            // a background sync may be happening and we may be interested in it, handle when it ends
            localSyncCallback = debounce(
              async () => {
                for (let i = 0; i < localFilters.length; i++) {
                  const filter = localFilters[i]
                  for (const event of await store.queryEvents(filter, 5_000)) {
                    // check if this isn't already in the sorted array of events
                    const [_, exists] = binarySearch(events, (b) => {
                      if (event.id === b.id) return 0
                      if (event.created_at === b.created_at) return -1
                      return b.created_at - event.created_at
                    })
                    if (!exists) {
                      onNew(event)
                    }
                  }
                }
              },
              2000,
              2800
            )
            current.onsync.push(localSyncCallback)

            // we'll use this for the live query
            const allAuthors = (
              await Promise.all(
                localFilters.map(async (f) => {
                  if (f.authors) return f.authors
                  return []
                })
              )
            ).flat()

            // listen for live updates to local db
            ready().then(() => {
              outbox.live(allAuthors, {
                signal: abort.signal
              })

              localNewCallback = (event: NostrEvent) => {
                if (matchFilters(localFilters, event)) onNew(event)
              }
              current.onnew.push(localNewCallback)
            })

            return [events, newestEvent, allAuthors]
          })()

    // do relay requests
    const network =
      relayRequests.length === 0
        ? Promise.resolve([])
        : new Promise<NostrEvent[]>((resolve) => {
            let eosed = false

            // keep track of this just so we can refer to them for onClose
            const urls: string[] = []

            let events: NostrEvent[] = []
            subc = pool.subscribeMap(
              relayRequests.flatMap(({ urls, filter }) =>
                urls.flatMap((url) => {
                  if (!urls.includes(url)) urls.push(url)
                  return { url, filter }
                })
              ),
              {
                label: 'f-timeline',
                onevent: (evt) => {
                  if (!eosed) {
                    events.push(evt)
                  } else {
                    onNew(evt)
                  }

                  if (localFilters.length) {
                    // if we're querying local filters simultaneously with external relays
                    // that means we want to store the results from the external relays in the local filters
                    // for consistency
                    this.addEventToCache(evt)
                  }
                },
                oneose() {
                  eosed = true
                  resolve(events)
                  events = []
                },
                onauth: (async (authEvt) => {
                  // already logged in
                  if (this.signer) {
                    const evt = await this.signer!.signEvent(authEvt)
                    if (!evt) {
                      throw new Error('sign event failed')
                    }
                    return evt as VerifiedEvent
                  }

                  // open login dialog
                  if (startLogin) {
                    startLogin()
                  }

                  throw new Error(
                    "<not logged in, can't auth to relay during this.subscribeTimeline>"
                  )
                }) as (event: EventTemplate) => Promise<VerifiedEvent>,
                onclose(reasons) {
                  if (onClose) {
                    for (let i = 0; i < reasons.length; i++) {
                      const reason = reasons[i]
                      onClose(urls[i], reason)
                    }
                  }
                  resolve(events)
                }
              }
            )
          })

    if (localFilters.length > 0 && relayRequests.length > 0) {
      // if both exist, assume localFilters will load much faster and handle they first
      local.then(([eventsL]) => {
        if (localFilters.length > 1) eventsL.sort((a, b) => b.created_at - a.created_at)
        onEvents(eventsL, false) // not final: will be called again with all the events later
      })
    }

    let preliminarySub: SubCloser | undefined
    if (
      relayRequests.length === 0 &&
      localFilters.length === 1 &&
      (localFilters[0]!.authors?.length || 0) >= 1
    ) {
      // edge case: used mainly on the first time the app is used
      // in case we're fetching a _following feed_ or _profile feed_ solely from the local db but we have nothing
      // (or only very old events) do a temporary fallback relay query here while the sync completes
      local.then(async ([_, newestEvent, allAuthors]) => {
        if (!newestEvent || newestEvent.created_at < Date.now() / 1000 - 60 * 60 * 24 * 7) {
          const events: NostrEvent[] = []
          preliminarySub = pool.subscribeMap(
            await outboxFilterRelayBatch(allAuthors, { ...localFilters[0], limit: 10 }),
            {
              label: `f-temporary`,
              onevent(event) {
                events.push(event)
              },
              oneose() {
                preliminarySub!.close('preliminary req closed automatically on eose')
                events.sort((a, b) => b.created_at - a.created_at)
                onEvents(events, false) // not final. it will be final when the sync completes
              }
            }
          )

          // now the sync is complete, do the query again
          ready().then(async () => {
            const events: NostrEvent[] = new Array(200)
            let f = 0
            for (let i = 0; i < localFilters.length; i++) {
              for (const event of await store.queryEvents(localFilters[i], 5_000)) {
                events[f] = event
                f++
              }
            }
            events.length = f
            events.sort((a, b) => b.created_at - a.created_at)
            onEvents(events, true)
          })
        }
      })
    }

    Promise.all([local, network]).then(([[eventsL], eventsN]) => {
      if (eventsL.length > 0 && eventsN.length > 0) {
        eventsL.push(...eventsN)
        eventsL.sort((a, b) => b.created_at - a.created_at)
        onEvents(
          eventsL.filter((item, i) => i === 0 || item.id !== eventsL[i - 1].id),
          true
        )
      } else if (eventsL.length) {
        if (localFilters.length > 1) eventsL.sort((a, b) => b.created_at - a.created_at)
        onEvents(eventsL, true)
      } else if (eventsN.length) {
        if (relayRequests.length > 1 || relayRequests[0].urls.length > 1)
          eventsN.sort((a, b) => b.created_at - a.created_at)
        onEvents(eventsN, true)
      } else {
        // No events found, but still need to signal completion
        onEvents([], true)
      }
    })

    return {
      close() {
        onClose = undefined
        abort.abort('<subc>')
        subc?.close?.()
        preliminarySub?.close?.()
        if (localSyncCallback) {
          const idx = current.onsync.indexOf(localSyncCallback)
          if (idx !== -1) {
            current.onsync.splice(idx, 1)
          }
        }
        if (localNewCallback) {
          const idx = current.onnew.indexOf(localNewCallback)
          if (idx !== -1) {
            current.onnew.splice(idx, 1)
          }
        }
      }
    }
  }

  async loadMoreTimeline(
    subRequests: TFeedSubRequest[],
    filterModification: Filter,
    {
      startLogin
    }: {
      startLogin?: () => void
    } = {}
  ): Promise<NostrEvent[]> {
    const localFilters = subRequests
      .filter((req): req is Extract<TFeedSubRequest, { source: 'local' }> => req.source === 'local')
      .map(({ filter }) => ({
        ...filter,
        ...filterModification
      }))

    const relayRequests = subRequests
      .filter(
        (req): req is Extract<TFeedSubRequest, { source: 'relays' }> => req.source === 'relays'
      )
      .map(({ urls, filter }) => ({
        urls,
        filter: {
          ...filter,
          ...filterModification
        }
      }))

    // do relay requests
    const network =
      relayRequests.length === 0
        ? Promise.resolve([])
        : await new Promise<NostrEvent[]>((resolve) => {
            const events: NostrEvent[] = []
            const subc = pool.subscribeMap(
              relayRequests.flatMap(({ urls, filter }) => urls.flatMap((url) => ({ url, filter }))),
              {
                label: 'f-more',
                onevent(evt) {
                  events.push(evt)
                },
                oneose() {
                  subc.close()
                  resolve(events)
                },
                onclose() {
                  resolve(events)
                },
                onauth: (async (authEvt) => {
                  // already logged in
                  if (this.signer) {
                    const evt = await this.signer!.signEvent(authEvt)
                    if (!evt) {
                      throw new Error('sign event failed')
                    }
                    return evt as VerifiedEvent
                  }

                  // open login dialog
                  if (startLogin) {
                    startLogin()
                    return
                  }

                  throw new Error(
                    "<not logged in, can't auth to relay during this.loadMoreTimeline>"
                  )
                }) as (event: EventTemplate) => Promise<VerifiedEvent>
              }
            )
          })

    // do local requests
    const local =
      localFilters.length === 0
        ? Promise.resolve([])
        : (async () => {
            const events: NostrEvent[] = new Array(200)
            let f = 0
            for (let i = 0; i < localFilters.length; i++) {
              const filter = localFilters[i]
              for (const event of await store.queryEvents(filter, 5_000)) {
                events[f] = event
                f++
              }
            }
            events.length = f
            return events
          })()

    return Promise.all([local, network]).then(([eventsL, eventsN]) => {
      if (eventsL.length > 0 && eventsN.length > 0) {
        eventsL.push(...eventsN)
        eventsL.sort((a, b) => b.created_at - a.created_at)
        return eventsL
      } else if (eventsL.length) {
        if (localFilters.length > 1) eventsL.sort((a, b) => b.created_at - a.created_at)
        return eventsL
      } else if (eventsN.length) {
        if (relayRequests.length > 1 || relayRequests[0]?.urls.length > 1)
          eventsN.sort((a, b) => b.created_at - a.created_at)
        return eventsN
      } else {
        return []
      }
    })
  }

  /** =========== Event =========== */

  getSeenEventRelays(eventId: string) {
    return Array.from(pool.seenOn.get(eventId)?.values() || [])
  }

  getSeenEventRelayUrls(eventId: string, event?: NostrEvent) {
    const poolUrls = this.getSeenEventRelays(eventId).map((relay) => relay.url)

    // events loaded from the store may have a special list of "seenOn" relays attached
    const relays = event ? seenOn(event) : []
    const combined = new Set([...poolUrls, ...relays])

    return Array.from(combined)
  }

  getEventHints(eventId: string, event?: NostrEvent) {
    return this.getSeenEventRelayUrls(eventId, event).filter((url) => !isLocalNetworkUrl(url))
  }

  getEventHint(eventId: string, event?: NostrEvent) {
    return this.getSeenEventRelayUrls(eventId, event).find((url) => !isLocalNetworkUrl(url)) ?? ''
  }

  trackEventSeenOn(eventId: string, relay: AbstractRelay) {
    let set = pool.seenOn.get(eventId)
    if (!set) {
      set = new Set()
      pool.seenOn.set(eventId, set)
    }
    set.add(relay)
  }

  async fetchEvents(
    urls: string[],
    filter: Filter,
    {
      cache = false
    }: {
      onevent?: (evt: NostrEvent) => void
      cache?: boolean
    } = {}
  ) {
    const relays = urls.filter((url, i) => i === 0 || urls[i - 1] !== url)
    const events: NostrEvent[] = []

    await new Promise<void>((resolve) => {
      pool.subscribeEose(relays, filter, {
        label: 'f-fetch-events',
        maxWait: 10_000,
        onauth: (async (authEvt) => {
          if (this.signer) {
            const evt = await this.signer!.signEvent(authEvt)
            if (!evt) {
              throw new Error('sign event failed')
            }
            return evt as VerifiedEvent
          }

          throw new Error("<not logged in, can't auth to relay during this.fetchEvents>")
        }) as (event: EventTemplate) => Promise<VerifiedEvent>,
        onevent: (event: NostrEvent) => {
          events.push(event)
          if (cache) {
            this.addEventToCache(event)
          }
        },
        onclose(_: string[]) {
          resolve()
        }
      })
    })

    return events
  }

  async fetchTrendingNotes() {
    if (this.trendingNotesCache) {
      return this.trendingNotesCache
    }

    try {
      const response = await fetch('https://api.nostr.band/v0/trending/notes')
      const data = await response.json()
      const events: NostrEvent[] = []
      for (const note of data.notes ?? []) {
        if (validateEvent(note.event)) {
          events.push(note.event)
          this.addEventToCache(note.event)
          if (note.relays?.length) {
            note.relays.map((r: string) => {
              try {
                const relay = new AbstractRelay(r, {
                  verifyEvent: verifyEvent
                })
                this.trackEventSeenOn(note.event.id, relay)
              } catch {
                return null
              }
            })
          }
        }
      }
      this.trendingNotesCache = events
      return this.trendingNotesCache
    } catch (error) {
      console.error('fetchTrendingNotes error', error)
      return []
    }
  }

  addEventToCache(event: NostrEvent) {
    store.saveEvent(event, {
      seenOn: Array.from(pool.seenOn.get(event.id) || []).map((relay) => relay.url)
    })
  }

  async fetchEvent(idOrCode: string): Promise<NostrEvent | undefined> {
    let filter: Filter | undefined
    let relayHints: string[] = []
    let authorHint: string | undefined
    if (isHex32(idOrCode)) {
      filter = { ids: [idOrCode] }
    } else {
      const { type, data } = nip19.decode(idOrCode)
      switch (type) {
        case 'note':
          filter = { ids: [data] }
          break
        case 'nevent':
          filter = { ids: [data.id] }
          if (data.relays) relayHints = data.relays
          if (data.author) authorHint = data.author
          break
        case 'naddr':
          filter = {
            authors: [data.pubkey],
            kinds: [data.kind],
            limit: 1
          }
          authorHint = data.pubkey
          if (data.identifier) {
            filter['#d'] = [data.identifier]
          }
          if (data.relays) relayHints = data.relays
      }
    }

    if (!filter) {
      throw new Error(`can't fetch ${idOrCode}`)
    }

    // before we try any network fetch try to load this from our local database
    for (const event of await store.queryEvents(filter, 1)) {
      // if we get anything we just return it
      return event
    }

    // start fetching this here so it's finished later when we need it
    const authorRelays = authorHint && loadRelayList(authorHint)

    // try the relay hints first
    if (relayHints.length) {
      relayHints = relayHints.map(normalizeUrl)
      const event = await pool.get(relayHints, filter, { label: 'f-specific-event-1' })
      if (event) {
        this.addEventToCache(event)
        return event
      }
    }

    // at this point we may already have our author hints so let's try those
    let authorRelaysUrls: string[] = []
    if (authorRelays) {
      authorRelaysUrls = (await authorRelays).items
        .filter((r) => r.write && !relayHints.includes(r.url))
        .map((r) => r.url)
      if (authorRelaysUrls.length) {
        const event = await pool.get(authorRelaysUrls, filter, { label: 'f-specific-event-2' })
        if (event) {
          this.addEventToCache(event)
          return event
        }
      }
    }

    // if we got nothing or there were no hints, try the big relays (except the ones we've already tried)
    const bigRelayHints = BIG_RELAY_URLS.filter(
      (br) => !(relayHints.includes(br) || authorRelaysUrls.includes(br))
    )
    bigRelayHints.push('wss://cache2.primal.net/v1')
    if (bigRelayHints.length) {
      const event = await pool.get(bigRelayHints, filter, { label: 'f-specific-event-3' })
      if (event) {
        this.addEventToCache(event)
        return event
      }
    }
  }

  /** =========== Followings =========== */

  async initUserIndexFromFollowings(pubkey: string) {
    ;(await loadFollowsList(pubkey)).items.forEach((pubkey) => this.fetchProfile(pubkey))
  }

  /** =========== Profile =========== */

  async searchProfiles(relayUrls: string[], filter: Filter): Promise<NostrUser[]> {
    const events = await pool.querySync(
      relayUrls,
      {
        ...filter,
        kinds: [kinds.Metadata]
      },
      { label: 'f-search-profiles', maxWait: 5_000 }
    )

    const profiles = events.map(nostrUserFromEvent)
    await Promise.allSettled(profiles.map((profile) => this.addUsernameToIndex(profile)))
    return profiles
  }

  async searchPubKeysFromLocal(query: string, limit: number = 100): Promise<string[]> {
    return this.userIndex.searchAsync(query, { limit }) as Promise<string[]>
  }

  async searchProfilesFromLocal(query: string, limit: number = 100): Promise<NostrUser[]> {
    const pubkeys = await this.searchPubKeysFromLocal(query, limit)
    const profiles = await Promise.all(pubkeys.map((pubkey) => this.fetchProfile(pubkey)))
    return profiles.filter((profile) => !!profile)
  }

  private async addUsernameToIndex(profile: NostrUser) {
    const text = [
      profile.metadata.display_name?.trim() ?? '',
      profile.metadata.name?.trim() ?? '',
      profile.metadata.nip05
        ?.split?.('@')
        ?.map?.((s: string) => s.trim())
        ?.join?.(' ') ?? ''
    ].join(' ')
    if (!text) return

    await this.userIndex.addAsync(profile.pubkey, text)
  }

  async fetchProfile(input: string, forceUpdate: boolean | NostrEvent = false): Promise<NostrUser> {
    let req: NostrUserRequest | undefined

    if (isValidPubkey(input)) {
      req = { pubkey: input }
    } else {
      try {
        const { type, data } = nip19.decode(input)
        if (type === 'npub') {
          req = { pubkey: data }
        } else if (type === 'nprofile') {
          req = data
        } else {
          throw new Error('not a profile reference')
        }
      } catch (error) {
        throw new Error('Error decoding user ref input: ' + input + ', error: ' + error)
      }
    }

    if (forceUpdate) {
      req!.refreshStyle = true
    }
    const profile = await loadNostrUser(req!)
    // Emit event for profile updates
    this.dispatchEvent(new CustomEvent('profileFetched:' + profile.pubkey, { detail: profile }))
    return profile
  }

  /** =========== Relay list =========== */
  async fetchRelayLists(pubkeys: string[], forceUpdate = false): Promise<TRelayList[]> {
    return Promise.all(pubkeys.map((pk) => this.fetchRelayList(pk, forceUpdate)))
  }

  async fetchRelayList(
    pubkey: string,
    forceUpdate: boolean | NostrEvent = false
  ): Promise<TRelayList> {
    return loadRelayList(pubkey, [], forceUpdate).then((r) => {
      if (!r.event) {
        return structuredClone(DEFAULT_RELAY_LIST)
      } else {
        return {
          write: r.items.filter((r) => r.write).map((r) => r.url),
          read: r.items.filter((r) => r.read).map((r) => r.url),
          originalRelays: r.items.map(({ url, read, write }) => ({
            url,
            scope: read && write ? 'both' : read ? 'read' : 'write'
          }))
        }
      }
    })
  }

  async fetchMuteList(
    pubkey: string,
    nip04Decrypt: undefined | ((pubkey: string, content: string) => Promise<string>),
    forceUpdate: boolean | NostrEvent = false
  ): Promise<TMutedList> {
    const muteList: TMutedList = {
      public: [],
      private: []
    }

    const result = await loadMuteList(pubkey, [], forceUpdate)

    muteList.public = result.items
      .filter((item) => item.label === 'pubkey')
      .map((item) => item.value)

    if (result.event && nip04Decrypt) {
      try {
        const plainText = await nip04Decrypt(pubkey, result.event.content)
        const privateTags = z.array(z.array(z.string())).parse(JSON.parse(plainText))

        for (let i = 0; i < privateTags.length; i++) {
          const tag = privateTags[i]
          if (tag[0] === 'p' && tag.length >= 2 && isHex32(tag[1])) {
            muteList.private.push(tag[1])
          }
        }
      } catch (_) {
        /***/
      }
    }

    return muteList
  }

  /** =========== Following favorite relays =========== */

  async fetchFollowingFavoriteRelays(pubkey: string): Promise<[string, Set<string>][]> {
    const waitgroup: Promise<void>[] = []
    const urls = new Map<string, Set<string>>()

    const followings = await loadFollowsList(pubkey)
    followings.items.forEach((pubkey) => {
      let r1: () => void
      const p1 = new Promise<void>((resolve) => {
        r1 = resolve
      })
      waitgroup.push(p1)

      loadFavoriteRelays(pubkey).then((fav) => {
        fav.items.forEach((url) => {
          if (typeof url !== 'string') return // TODO: load these too
          url = normalizeUrl(url)
          const thisurl = urls.get(url) || new Set()
          thisurl.add(pubkey)
        })
        r1()
      })

      let r2: () => void
      const p2 = new Promise<void>((resolve) => {
        r2 = resolve
      })
      waitgroup.push(p2)

      loadRelaySets(pubkey).then((favsets) => {
        Object.values(favsets).forEach((favset) => {
          favset.items.forEach((url) => {
            url = normalizeUrl(url)
            const thisurl = urls.get(url) || new Set()
            thisurl.add(pubkey)
          })
        })
        r2()
      })
    })

    await Promise.all(waitgroup)
    return Array.from(urls.entries()).sort(
      ([_urlA, usersA], [_urlB, usersB]) => usersB.size - usersA.size
    )
  }
}

const instance = ClientService.getInstance()

export default instance
