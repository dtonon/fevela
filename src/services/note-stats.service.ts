import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { getLightningAddressFromProfile } from '@/lib/lightning'
import { getActualId, tagNameEquals } from '@/lib/tag'
import client from '@/services/client.service'
import { TEmoji } from '@/types'
import dayjs from 'dayjs'
import { Event } from '@nostr/tools/wasm'
import { Filter } from '@nostr/tools/filter'
import * as kinds from '@nostr/tools/kinds'
import { pool, purgatory } from '@nostr/gadgets/global'

export type TNoteStats = {
  likeIdSet: Set<string>
  likes: { id: string; pubkey: string; created_at: number; emoji: TEmoji | string }[]
  repostPubkeySet: Set<string>
  reposts: { id: string; pubkey: string; created_at: number }[]
  zapPrSet: Set<string>
  zaps: { pr: string; pubkey: string; amount: number; created_at: number; comment?: string }[]
  updatedAt?: number
}

class NoteStatsService {
  static instance: NoteStatsService
  private noteStatsMap: Map<string, Partial<TNoteStats>> = new Map()
  private noteStatsSubscribers = new Map<string, Set<() => void>>()

  constructor() {
    if (!NoteStatsService.instance) {
      NoteStatsService.instance = this
    }
    return NoteStatsService.instance
  }

  async fetchNoteStats(event: Event, pubkey?: string | null) {
    const id = getActualId(event)

    const oldStats = this.noteStatsMap.get(id)
    let since: number | undefined
    if (oldStats?.updatedAt) {
      since = oldStats.updatedAt
    }
    const [relayList, authorProfile] = await Promise.all([
      client.fetchRelayList(event.pubkey),
      client.fetchProfile(event.pubkey)
    ])

    const replaceableCoordinate = isReplaceableEvent(event.kind)
      ? getReplaceableCoordinateFromEvent(event)
      : undefined

    const filters: Filter[] = [
      {
        '#e': [id],
        kinds: [kinds.Reaction],
        limit: 500,
        since
      },
      {
        '#e': [id],
        kinds: [kinds.Repost],
        limit: 100,
        since
      }
    ]

    if (replaceableCoordinate) {
      filters.push(
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.Reaction],
          limit: 500,
          since
        },
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.Repost],
          limit: 100,
          since
        }
      )
    }

    if (getLightningAddressFromProfile(authorProfile)) {
      filters.push({
        '#e': [id],
        kinds: [kinds.Zap],
        limit: 500,
        since
      })

      if (replaceableCoordinate) {
        filters.push({
          '#a': [replaceableCoordinate],
          kinds: [kinds.Zap],
          limit: 500,
          since
        })
      }
    }

    if (pubkey) {
      filters.push({
        '#e': [id],
        authors: [pubkey],
        kinds: [kinds.Reaction, kinds.Repost],
        since
      })

      if (replaceableCoordinate) {
        filters.push({
          '#a': [replaceableCoordinate],
          authors: [pubkey],
          kinds: [kinds.Reaction, kinds.Repost],
          since
        })
      }

      if (getLightningAddressFromProfile(authorProfile)) {
        filters.push({
          '#e': [id],
          '#P': [pubkey],
          kinds: [kinds.Zap],
          since
        })

        if (replaceableCoordinate) {
          filters.push({
            '#a': [replaceableCoordinate],
            '#P': [pubkey],
            kinds: [kinds.Zap],
            since
          })
        }
      }
    }

    const reactions: Event[] = []
    await new Promise<void>((resolve) => {
      const subc = pool.subscribeMap(
        relayList.read
          .concat(window.fevela.universe.bigRelayUrls)
          .filter((r) => purgatory.allowConnectingToRelay(r, ['read', filters]))
          .slice(0, 3)
          .flatMap((url) => filters.map((filter) => ({ url, filter }))),
        {
          label: 'f-stats',
          onevent(evt) {
            reactions.push(evt)
          },
          oneose() {
            resolve()
            subc.close()
          }
        }
      )
    })
    this.updateNoteStatsByEvents(reactions)

    const updated = {
      ...(this.noteStatsMap.get(id) ?? {}),
      updatedAt: dayjs().unix()
    }
    this.noteStatsMap.set(id, updated)

    return updated
  }

  subscribeNoteStats(noteId: string, callback: () => void) {
    let set = this.noteStatsSubscribers.get(noteId)
    if (!set) {
      set = new Set()
      this.noteStatsSubscribers.set(noteId, set)
    }
    set.add(callback)
    return () => {
      set?.delete(callback)
      if (set?.size === 0) this.noteStatsSubscribers.delete(noteId)
    }
  }

  private notifyNoteStats(noteId: string) {
    const set = this.noteStatsSubscribers.get(noteId)
    if (set) {
      set.forEach((cb) => cb())
    }
  }

  getNoteStats(id: string): Partial<TNoteStats> | undefined {
    return this.noteStatsMap.get(id)
  }

  addZap(
    pubkey: string,
    eventId: string,
    pr: string,
    amount: number,
    comment?: string,
    created_at: number = dayjs().unix(),
    notify: boolean = true
  ) {
    const old = this.noteStatsMap.get(eventId) || {}
    const zapPrSet = old.zapPrSet || new Set()
    const zaps = old.zaps || []
    if (zapPrSet.has(pr)) return

    zapPrSet.add(pr)
    zaps.push({ pr, pubkey, amount, comment, created_at })
    this.noteStatsMap.set(eventId, { ...old, zapPrSet, zaps })
    if (notify) {
      this.notifyNoteStats(eventId)
    }
    return eventId
  }

  updateNoteStatsByEvents(events: Event[]) {
    const updatedEventIdSet = new Set<string>()
    events.forEach((evt) => {
      let updatedEventId: string | undefined
      if (evt.kind === kinds.Reaction) {
        updatedEventId = this.addLikeByEvent(evt)
      } else if (evt.kind === kinds.Repost) {
        updatedEventId = this.addRepostByEvent(evt)
      } else if (evt.kind === kinds.Zap) {
        updatedEventId = this.addZapByEvent(evt)
      }
      if (updatedEventId) {
        updatedEventIdSet.add(updatedEventId)
      }
    })
    updatedEventIdSet.forEach((eventId) => {
      this.notifyNoteStats(eventId)
    })
  }

  private addLikeByEvent(evt: Event) {
    const targetEventId = evt.tags.findLast(tagNameEquals('e'))?.[1]
    if (!targetEventId) return

    const old = this.noteStatsMap.get(targetEventId) || {}
    const likeIdSet = old.likeIdSet || new Set()
    const likes = old.likes || []
    if (likeIdSet.has(evt.id)) return

    let emoji: TEmoji | string
    if (evt.content.startsWith(':') && evt.content.endsWith(':')) {
      const emojiTag = evt.tags.find(
        ([t, shortcode]) => t === 'emoji' && shortcode === evt.content.slice(1, -1)
      )
      emoji = emojiTag ? { url: emojiTag[2], shortcode: emojiTag[1] } : '+'
    } else {
      emoji = evt.content
    }

    likeIdSet.add(evt.id)
    likes.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at, emoji })
    this.noteStatsMap.set(targetEventId, { ...old, likeIdSet, likes })
    return targetEventId
  }

  private addRepostByEvent(evt: Event) {
    const eventId = evt.tags.find(tagNameEquals('e'))?.[1]
    if (!eventId) return

    const old = this.noteStatsMap.get(eventId) || {}
    const repostPubkeySet = old.repostPubkeySet || new Set()
    const reposts = old.reposts || []
    if (repostPubkeySet.has(evt.pubkey)) return

    repostPubkeySet.add(evt.pubkey)
    reposts.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(eventId, { ...old, repostPubkeySet, reposts })
    return eventId
  }

  private addZapByEvent(evt: Event) {
    const info = getZapInfoFromEvent(evt)
    if (!info) return
    const { originalEventId, senderPubkey, invoice, amount, comment } = info
    if (!originalEventId || !senderPubkey) return

    return this.addZap(
      senderPubkey,
      originalEventId,
      invoice,
      amount,
      comment,
      evt.created_at,
      false
    )
  }
}

const instance = new NoteStatsService()

export default instance
