import { BIG_RELAY_URLS, DEFAULT_RELAY_LIST, ExtendedKind } from '@/constants'
import {
  compareEvents,
  getReplaceableCoordinate,
  getReplaceableCoordinateFromEvent,
  isReplaceableEvent
} from '@/lib/event'
import { isValidPubkey, pubkeyToNpub } from '@/lib/pubkey'
import { tagNameEquals, getEmojiInfosFromEmojiTags } from '@/lib/tag'
import { isLocalNetworkUrl, normalizeHttpUrl, normalizeUrl } from '@/lib/url'
import {
  ISigner,
  TPublishOptions,
  TRelayList,
  TSubRequestFilter,
  TEmoji,
  TMutedList
} from '@/types'
import { sha256 } from '@noble/hashes/sha2'
import DataLoader from 'dataloader'
import dayjs from 'dayjs'
import FlexSearch from 'flexsearch'
import {
  EventTemplate,
  Event as NEvent,
  NostrEvent,
  validateEvent,
  VerifiedEvent
} from '@nostr/tools/wasm'
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
  makeListFetcher,
  itemsFromTags,
  loadFollowsList,
  loadMuteList,
  loadFavoriteRelays
} from '@nostr/gadgets/lists'
import { loadRelaySets, makeSetFetcher } from '@nostr/gadgets/sets'
import z from 'zod'
import { isHex32 } from '@nostr/gadgets/utils'
import { AddressPointer } from '@nostr/tools/nip19'
import { verifyEvent } from '@nostr/tools/wasm'

type TTimelineRef = [string, number]

class ClientService extends EventTarget {
  static instance: ClientService

  signer?: ISigner
  pubkey?: string

  private timelines: Record<
    string,
    | {
        refs: TTimelineRef[]
        filter: TSubRequestFilter
        urls: string[]
      }
    | string[]
    | undefined
  > = {}
  private replaceableEventCacheMap = new Map<string, NEvent>()
  private eventCacheMap = new Map<string, Promise<NEvent | undefined>>()
  private eventDataLoader = new DataLoader<string, NEvent | undefined>(
    (ids) => Promise.all(ids.map((id) => this._fetchEvent(id))),
    { cacheMap: this.eventCacheMap }
  )
  private fetchEventFromBigRelaysDataloader = new DataLoader<string, NEvent | undefined>(
    this.fetchEventsFromBigRelays.bind(this),
    { cache: false, batchScheduleFn: (callback) => setTimeout(callback, 50) }
  )
  private trendingNotesCache: NEvent[] | null = null

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
    event: NEvent,
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

  async publishEvent(relayUrls: string[], event: NEvent) {
    const uniqueRelayUrls = Array.from(new Set(relayUrls))
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

  emitNewEvent(event: NEvent) {
    this.dispatchEvent(new CustomEvent('newEvent', { detail: event }))
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

  private generateTimelineKey(urls: string[], filter: Filter) {
    const stableFilter: any = {}
    Object.entries(filter)
      .sort()
      .forEach(([key, value]) => {
        if (Array.isArray(value)) {
          stableFilter[key] = [...value].sort()
        }
        stableFilter[key] = value
      })
    const paramsStr = JSON.stringify({
      urls: [...urls].sort(),
      filter: stableFilter
    })
    const encoder = new TextEncoder()
    const data = encoder.encode(paramsStr)
    const hashBuffer = sha256(data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  private generateMultipleTimelinesKey(subRequests: { urls: string[]; filter: Filter }[]) {
    const keys = subRequests.map(({ urls, filter }) => this.generateTimelineKey(urls, filter))
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(keys.sort()))
    const hashBuffer = sha256(data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async subscribeTimeline(
    subRequests: { urls: string[]; filter: TSubRequestFilter }[],
    {
      onEvents,
      onNew,
      onClose
    }: {
      onEvents: (events: NEvent[], eosed: boolean) => void
      onNew: (evt: NEvent) => void
      onClose?: (url: string, reason: string) => void
    },
    {
      startLogin,
      needSort = true
    }: {
      startLogin?: () => void
      needSort?: boolean
    } = {}
  ) {
    const newEventIdSet = new Set<string>()
    const requestCount = subRequests.length
    const threshold = Math.floor(requestCount / 2)
    let eventIdSet = new Set<string>()
    let events: NEvent[] = []
    let eosedCount = 0

    const subs = await Promise.all(
      subRequests.map(({ urls, filter }) => {
        return this._subscribeTimeline(
          urls,
          filter,
          {
            onEvents: (_events, _eosed) => {
              if (_eosed) {
                eosedCount++
              }

              _events.forEach((evt) => {
                if (eventIdSet.has(evt.id)) return
                eventIdSet.add(evt.id)
                events.push(evt)
              })
              events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
              eventIdSet = new Set(events.map((evt) => evt.id))

              if (eosedCount >= threshold) {
                onEvents(events, eosedCount >= requestCount)
              }
            },
            onNew: (evt) => {
              if (newEventIdSet.has(evt.id)) return
              newEventIdSet.add(evt.id)
              onNew(evt)
            },
            onClose
          },
          { startLogin, needSort }
        )
      })
    )

    const key = this.generateMultipleTimelinesKey(subRequests)
    this.timelines[key] = subs.map((sub) => sub.timelineKey)

    return {
      closer: () => {
        onEvents = () => {}
        onNew = () => {}
        subs.forEach((sub) => {
          sub.closer()
        })
      },
      timelineKey: key
    }
  }

  async loadMoreTimeline(key: string, until: number, limit: number) {
    const timeline = this.timelines[key]
    if (!timeline) return []

    if (!Array.isArray(timeline)) {
      return this._loadMoreTimeline(key, until, limit)
    }
    const timelines = await Promise.all(
      timeline.map((key) => this._loadMoreTimeline(key, until, limit))
    )

    const eventIdSet = new Set<string>()
    const events: NEvent[] = []
    timelines.forEach((timeline) => {
      timeline.forEach((evt) => {
        if (eventIdSet.has(evt.id)) return
        eventIdSet.add(evt.id)
        events.push(evt)
      })
    })
    return events.sort((a, b) => b.created_at - a.created_at)
  }

  subscribe(
    urls: string[],
    filter: Filter | Filter[],
    {
      onevent,
      oneose,
      onclose,
      startLogin,
      onAllClose
    }: {
      onevent?: (evt: NEvent) => void
      oneose?: (eosed: boolean) => void
      onclose?: (url: string, reason: string) => void
      startLogin?: () => void
      onAllClose?: (reasons: string[]) => void
    }
  ) {
    const relays = Array.from(new Set(urls))
    const filters = Array.isArray(filter) ? filter : [filter]

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    const _knownIds = new Set<string>()
    let startedCount = 0
    let eosedCount = 0
    let eosed = false
    let closedCount = 0
    const closeReasons: string[] = []
    const subPromises: Promise<{ close: () => void }>[] = []
    relays.forEach((url) => {
      let hasAuthed = false

      subPromises.push(startSub())

      async function startSub() {
        startedCount++
        const relay = await pool.ensureRelay(url, { connectionTimeout: 5000 }).catch((err) => {
          console.warn(
            `⚠️ [Relay Connection Failed] ${url}`,
            err?.message || err || 'Unknown error'
          )
          return undefined
        })
        // cannot connect to relay
        if (!relay) {
          if (!eosed) {
            eosedCount++
            eosed = eosedCount >= startedCount
            oneose?.(eosed)
          }
          return {
            close: () => {}
          }
        }

        return relay.subscribe(filters, {
          receivedEvent: (relay, id) => {
            that.trackEventSeenOn(id, relay)
          },
          alreadyHaveEvent: (id: string) => {
            const have = _knownIds.has(id)
            if (have) {
              return true
            }
            _knownIds.add(id)
            return false
          },
          onevent: (evt: NEvent) => {
            onevent?.(evt)
          },
          oneose: () => {
            // make sure eosed is not called multiple times
            if (eosed) return

            eosedCount++
            eosed = eosedCount >= startedCount
            oneose?.(eosed)
          },
          onclose: (reason: string) => {
            // auth-required
            if (reason.startsWith('auth-required') && !hasAuthed) {
              // already logged in
              if (that.signer) {
                relay
                  .auth(async (authEvt: EventTemplate) => {
                    const evt = await that.signer!.signEvent(authEvt)
                    if (!evt) {
                      throw new Error('sign event failed')
                    }
                    return evt as VerifiedEvent
                  })
                  .then(() => {
                    hasAuthed = true
                    if (!eosed) {
                      subPromises.push(startSub())
                    }
                  })
                  .catch(() => {
                    // ignore
                  })
                return
              }

              // open login dialog
              if (startLogin) {
                startLogin()
                return
              }
            }

            // close the subscription
            closedCount++
            closeReasons.push(reason)
            onclose?.(url, reason)
            if (closedCount >= startedCount) {
              onAllClose?.(closeReasons)
            }
            return
          },
          eoseTimeout: 10_000 // 10s
        })
      }
    })

    const handleNewEventFromInternal = (data: Event) => {
      const customEvent = data as CustomEvent<NEvent>
      const evt = customEvent.detail
      if (!matchFilters(filters, evt)) return

      const id = evt.id
      const have = _knownIds.has(id)
      if (have) return

      _knownIds.add(id)
      onevent?.(evt)
    }

    this.addEventListener('newEvent', handleNewEventFromInternal)

    return {
      close: () => {
        this.removeEventListener('newEvent', handleNewEventFromInternal)
        subPromises.forEach((subPromise) => {
          subPromise
            .then((sub) => {
              sub.close()
            })
            .catch((err) => {
              console.error(err)
            })
        })
      }
    }
  }

  private async _subscribeTimeline(
    urls: string[],
    filter: TSubRequestFilter, // filter with limit,
    {
      onEvents,
      onNew,
      onClose
    }: {
      onEvents: (events: NEvent[], eosed: boolean) => void
      onNew: (evt: NEvent) => void
      onClose?: (url: string, reason: string) => void
    },
    {
      startLogin,
      needSort = true
    }: {
      startLogin?: () => void
      needSort?: boolean
    } = {}
  ) {
    const relays = Array.from(new Set(urls))
    const key = this.generateTimelineKey(relays, filter)
    const timeline = this.timelines[key]
    let cachedEvents: NEvent[] = []
    let since: number | undefined
    if (timeline && !Array.isArray(timeline) && timeline.refs.length && needSort) {
      cachedEvents = (
        await this.eventDataLoader.loadMany(timeline.refs.slice(0, filter.limit).map(([id]) => id))
      ).filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[]
      if (cachedEvents.length) {
        onEvents([...cachedEvents], false)
        since = cachedEvents[0].created_at + 1
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    let events: NEvent[] = []
    let eosedAt: number | null = null
    const subCloser = this.subscribe(relays, since ? { ...filter, since } : filter, {
      startLogin,
      onevent: (evt: NEvent) => {
        that.addEventToCache(evt)
        // not eosed yet, push to events
        if (!eosedAt) {
          return events.push(evt)
        }
        // new event
        if (evt.created_at > eosedAt) {
          onNew(evt)
        }

        const timeline = that.timelines[key]
        if (!timeline || Array.isArray(timeline) || !timeline.refs.length) {
          return
        }

        // find the right position to insert
        let idx = 0
        for (const ref of timeline.refs) {
          if (evt.created_at > ref[1] || (evt.created_at === ref[1] && evt.id < ref[0])) {
            break
          }
          // the event is already in the cache
          if (evt.created_at === ref[1] && evt.id === ref[0]) {
            return
          }
          idx++
        }
        // the event is too old, ignore it
        if (idx >= timeline.refs.length) return

        // insert the event to the right position
        timeline.refs.splice(idx, 0, [evt.id, evt.created_at])
      },
      oneose: (eosed) => {
        if (eosed && !eosedAt) {
          eosedAt = dayjs().unix()
        }
        // (algo feeds) no need to sort and cache
        if (!needSort) {
          return onEvents([...events], !!eosedAt)
        }
        if (!eosed) {
          events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
          return onEvents([...events.concat(cachedEvents).slice(0, filter.limit)], false)
        }

        events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
        const timeline = that.timelines[key]
        // no cache yet
        if (!timeline || Array.isArray(timeline) || !timeline.refs.length) {
          that.timelines[key] = {
            refs: events.map((evt) => [evt.id, evt.created_at]),
            filter,
            urls
          }
          return onEvents([...events], true)
        }

        // Prevent concurrent requests from duplicating the same event
        const firstRefCreatedAt = timeline.refs[0][1]
        const newRefs = events
          .filter((evt) => evt.created_at > firstRefCreatedAt)
          .map((evt) => [evt.id, evt.created_at] as TTimelineRef)

        if (events.length >= filter.limit) {
          // if new refs are more than limit, means old refs are too old, replace them
          timeline.refs = newRefs
          onEvents([...events], true)
        } else {
          // merge new refs with old refs
          timeline.refs = newRefs.concat(timeline.refs)
          onEvents([...events.concat(cachedEvents).slice(0, filter.limit)], true)
        }
      },
      onclose: onClose
    })

    return {
      timelineKey: key,
      closer: () => {
        onEvents = () => {}
        onNew = () => {}
        subCloser.close()
      }
    }
  }

  private async _loadMoreTimeline(key: string, until: number, limit: number) {
    const timeline = this.timelines[key]
    if (!timeline || Array.isArray(timeline)) return []

    const { filter, urls, refs } = timeline
    const startIdx = refs.findIndex(([, createdAt]) => createdAt <= until)
    const cachedEvents =
      startIdx >= 0
        ? ((
            await this.eventDataLoader.loadMany(
              refs.slice(startIdx, startIdx + limit).map(([id]) => id)
            )
          ).filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[])
        : []
    if (cachedEvents.length >= limit) {
      return cachedEvents
    }

    until = cachedEvents.length ? cachedEvents[cachedEvents.length - 1].created_at - 1 : until
    limit = limit - cachedEvents.length
    let events = await this.query(urls, { ...filter, until, limit })
    events.forEach((evt) => {
      this.addEventToCache(evt)
    })
    events = events.sort((a, b) => b.created_at - a.created_at).slice(0, limit)

    // Prevent concurrent requests from duplicating the same event
    const lastRefCreatedAt = refs.length > 0 ? refs[refs.length - 1][1] : dayjs().unix()
    timeline.refs.push(
      ...events
        .filter((evt) => evt.created_at < lastRefCreatedAt)
        .map((evt) => [evt.id, evt.created_at] as TTimelineRef)
    )
    return [...cachedEvents, ...events]
  }

  /** =========== Event =========== */

  getSeenEventRelays(eventId: string) {
    return Array.from(pool.seenOn.get(eventId)?.values() || [])
  }

  getSeenEventRelayUrls(eventId: string) {
    return this.getSeenEventRelays(eventId).map((relay) => relay.url)
  }

  getEventHints(eventId: string) {
    return this.getSeenEventRelayUrls(eventId).filter((url) => !isLocalNetworkUrl(url))
  }

  getEventHint(eventId: string) {
    return this.getSeenEventRelayUrls(eventId).find((url) => !isLocalNetworkUrl(url)) ?? ''
  }

  trackEventSeenOn(eventId: string, relay: AbstractRelay) {
    let set = pool.seenOn.get(eventId)
    if (!set) {
      set = new Set()
      pool.seenOn.set(eventId, set)
    }
    set.add(relay)
  }

  private async query(urls: string[], filter: Filter | Filter[], onevent?: (evt: NEvent) => void) {
    return await new Promise<NEvent[]>((resolve) => {
      const events: NEvent[] = []
      const sub = this.subscribe(urls, filter, {
        onevent(evt) {
          onevent?.(evt)
          events.push(evt)
        },
        oneose: (eosed) => {
          if (eosed) {
            sub.close()
            resolve(events)
          }
        },
        onclose: () => {
          resolve(events)
        }
      })
    })
  }

  async fetchEvents(
    urls: string[],
    filter: Filter | Filter[],
    {
      onevent,
      cache = false
    }: {
      onevent?: (evt: NEvent) => void
      cache?: boolean
    } = {}
  ) {
    const relays = Array.from(new Set(urls))
    const events = await this.query(relays.length > 0 ? relays : BIG_RELAY_URLS, filter, onevent)
    if (cache) {
      events.forEach((evt) => {
        this.addEventToCache(evt)
      })
    }
    return events
  }

  async fetchEvent(id: string): Promise<NEvent | undefined> {
    if (!/^[0-9a-f]{64}$/.test(id)) {
      let eventId: string | undefined
      let coordinate: string | undefined
      const { type, data } = nip19.decode(id)
      switch (type) {
        case 'note':
          eventId = data
          break
        case 'nevent':
          eventId = data.id
          break
        case 'naddr':
          coordinate = getReplaceableCoordinate(data.kind, data.pubkey, data.identifier)
          break
      }
      if (coordinate) {
        const cache = this.replaceableEventCacheMap.get(coordinate)
        if (cache) {
          return cache
        }
      } else if (eventId) {
        const cache = this.eventCacheMap.get(eventId)
        if (cache) {
          return cache
        }
      }
    }
    return this.eventDataLoader.load(id)
  }

  async fetchTrendingNotes() {
    if (this.trendingNotesCache) {
      return this.trendingNotesCache
    }

    try {
      const response = await fetch('https://api.nostr.band/v0/trending/notes')
      const data = await response.json()
      const events: NEvent[] = []
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

  addEventToCache(event: NEvent) {
    this.eventDataLoader.prime(event.id, Promise.resolve(event))
    if (isReplaceableEvent(event.kind)) {
      const coordinate = getReplaceableCoordinateFromEvent(event)
      const cachedEvent = this.replaceableEventCacheMap.get(coordinate)
      if (!cachedEvent || compareEvents(event, cachedEvent) > 0) {
        this.replaceableEventCacheMap.set(coordinate, event)
      }
    }
  }

  private async fetchEventById(relayUrls: string[], id: string): Promise<NEvent | undefined> {
    const event = await this.fetchEventFromBigRelaysDataloader.load(id)
    if (event) {
      return event
    }

    return this.tryHarderToFetchEvent(relayUrls, { ids: [id], limit: 1 }, true)
  }

  private async _fetchEvent(id: string): Promise<NEvent | undefined> {
    let filter: Filter | undefined
    let relays: string[] = []
    let author: string | undefined
    if (/^[0-9a-f]{64}$/.test(id)) {
      filter = { ids: [id] }
    } else {
      const { type, data } = nip19.decode(id)
      switch (type) {
        case 'note':
          filter = { ids: [data] }
          break
        case 'nevent':
          filter = { ids: [data.id] }
          if (data.relays) relays = data.relays
          if (data.author) author = data.author
          break
        case 'naddr':
          filter = {
            authors: [data.pubkey],
            kinds: [data.kind],
            limit: 1
          }
          author = data.pubkey
          if (data.identifier) {
            filter['#d'] = [data.identifier]
          }
          if (data.relays) relays = data.relays
      }
    }
    if (!filter) {
      throw new Error('Invalid id')
    }

    let event: NEvent | undefined
    if (filter.ids?.length) {
      event = await this.fetchEventById(relays, filter.ids[0])
    }

    if (!event && author) {
      const relayList = await this.fetchRelayList(author)
      event = await this.tryHarderToFetchEvent(relayList.write.slice(0, 5), filter)
    }

    if (event && event.id !== id) {
      this.addEventToCache(event)
    }

    return event
  }

  private async tryHarderToFetchEvent(
    relayUrls: string[],
    filter: Filter,
    alreadyFetchedFromBigRelays = false
  ) {
    if (!relayUrls.length && filter.authors?.length) {
      const relayList = await this.fetchRelayList(filter.authors[0])
      relayUrls = alreadyFetchedFromBigRelays
        ? relayList.write.filter((url) => !BIG_RELAY_URLS.includes(url)).slice(0, 4)
        : relayList.write.slice(0, 4)
    } else if (!relayUrls.length && !alreadyFetchedFromBigRelays) {
      relayUrls = BIG_RELAY_URLS
    }
    if (!relayUrls.length) return

    const events = await this.query(relayUrls, filter)
    return events.sort((a, b) => b.created_at - a.created_at)[0]
  }

  private async fetchEventsFromBigRelays(ids: readonly string[]) {
    const events = await this.query(BIG_RELAY_URLS, {
      ids: Array.from(new Set(ids)),
      limit: ids.length
    })
    const eventsMap = new Map<string, NEvent>()
    for (const event of events) {
      eventsMap.set(event.id, event)
    }

    return ids.map((id) => eventsMap.get(id))
  }

  /** =========== Followings =========== */

  async initUserIndexFromFollowings(pubkey: string) {
    ;(await loadFollowsList(pubkey)).items.forEach((pubkey) => this.fetchProfile(pubkey))
  }

  /** =========== Profile =========== */

  async searchProfiles(relayUrls: string[], filter: Filter): Promise<NostrUser[]> {
    const events = await this.query(relayUrls, {
      ...filter,
      kinds: [kinds.Metadata]
    })

    const profiles = events.map(nostrUserFromEvent)
    await Promise.allSettled(profiles.map((profile) => this.addUsernameToIndex(profile)))
    return profiles
  }

  async searchNpubsFromLocal(query: string, limit: number = 100) {
    const result = await this.userIndex.searchAsync(query, { limit })
    return result.map((pubkey) => pubkeyToNpub(pubkey as string)).filter(Boolean) as string[]
  }

  async searchProfilesFromLocal(query: string, limit: number = 100): Promise<NostrUser[]> {
    const npubs = await this.searchNpubsFromLocal(query, limit)
    const profiles = await Promise.all(npubs.map((npub) => this.fetchProfile(npub)))
    return profiles.filter((profile) => !!profile)
  }

  private async addUsernameToIndex(profile: NostrUser) {
    const text = [
      profile.metadata.display_name?.trim() ?? '',
      profile.metadata.name?.trim() ?? '',
      profile.metadata.nip05
        ?.split('@')
        .map((s: string) => s.trim())
        .join(' ') ?? ''
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
      req!.forceUpdate = true
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
          originalRelays: []
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

  loadBookmarks = makeListFetcher<string>(
    kinds.BookmarkList,
    [],
    itemsFromTags<string>((tag: string[]): string | undefined => {
      if (tag.length >= 2 && (tag[0] === 'e' || tag[0] === 'a') && tag[1]) {
        return tag[1]
      }
    }),
    (_) => []
  )

  loadBlossomServers = makeListFetcher<string>(
    ExtendedKind.BLOSSOM_SERVER_LIST,
    [],
    (event) =>
      event
        ? event.tags
            .filter(tagNameEquals('server'))
            .map(([, url]) => (url ? normalizeHttpUrl(url) : ''))
            .filter(Boolean)
        : [],
    (_) => []
  )

  loadEmojis = makeListFetcher<TEmoji | AddressPointer>(
    kinds.UserEmojiList,
    [],
    itemsFromTags<TEmoji | AddressPointer>((tag: string[]): TEmoji | AddressPointer | undefined => {
      if (tag.length < 2) return
      if (tag[0] === 'a') {
        const spl = tag[1].split(':')
        if (!isHex32(spl[1]) || spl[0] !== '30030') return undefined
        return {
          identifier: spl.slice(2).join(':'),
          pubkey: spl[1],
          kind: parseInt(spl[0]),
          relays: tag[2] ? [tag[2]] : []
        }
      }
      if (tag.length < 3 || tag[0] !== 'emoji') return undefined
      return { shortcode: tag[1], url: tag[2] }
    }),
    (_) => []
  )

  loadPins = makeListFetcher<string>(
    kinds.Pinlist,
    [],
    itemsFromTags<string>((tag: string[]): string | undefined => {
      if (tag.length >= 2 && tag[0] === 'e' && tag[1]) {
        return tag[1]
      }
    }),
    (_) => []
  )

  loadEmojiSets = makeSetFetcher(kinds.Emojisets, (event) => getEmojiInfosFromEmojiTags(event.tags))

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
