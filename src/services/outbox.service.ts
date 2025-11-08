import { BIG_RELAY_URLS, SUPPORTED_KINDS } from '@/constants'
import { pool } from '@nostr/gadgets/global'
import { loadFollowsList } from '@nostr/gadgets/lists'
import { OutboxManager } from '@nostr/gadgets/outbox'
import { IDBEventStore } from '@nostr/gadgets/store'
import { NostrEvent } from '@nostr/tools/core'

export const store = new IDBEventStore()
export let outbox: OutboxManager

export const status: { syncing: true; pubkey: string } | { syncing: false } = { syncing: false }

export function end() {
  if (outbox) {
    outbox.close()
  }
}

export const current: {
  pubkey: string | null
  onsync?: () => void
  onnew?: (event: NostrEvent) => void
} = { pubkey: null }

let isReady: () => void
const _ready = new Promise<void>((resolve) => {
  isReady = resolve
})
export async function ready(): Promise<void> {
  return _ready
}

export async function start(account: string, followings: string[], signal: AbortSignal) {
  signal.onabort = () => {
    status.syncing = false
  }

  outbox = new OutboxManager([{ kinds: SUPPORTED_KINDS }], {
    pool,
    label: 'fevela',
    store,
    onsyncupdate(pubkey) {
      if (!current.pubkey || current?.pubkey === pubkey) {
        console.log(':: synced updating', pubkey)
        current?.onsync?.()
      }
    },
    onbeforeupdate(pubkey) {
      console.log(':: paginated', pubkey)
      if (!current.pubkey || current?.pubkey === pubkey) {
        current?.onsync?.()
      }
    },
    onliveupdate(event) {
      if (!current.pubkey || current?.pubkey === event.pubkey) {
        console.log(':: live', event)
        current.onnew?.(event)
      }
    },
    defaultRelaysForConfusedPeople: BIG_RELAY_URLS,
    storeRelaysSeenOn: true,
    authorIsFollowedBy(author: string): string[] | undefined {
      if (followings.includes(author)) return [account]
    }
  })

  status.syncing = true
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = account

  const targets = [account, ...followings]
  const hasNew = await outbox.sync(targets, {
    signal
  })

  isReady()

  if (hasNew) {
    current.onsync?.()
  }

  outbox.live(targets, { signal: undefined })
}

export function updateFollowedEventsIndex(account: string, previous: string[], next: string[]) {
  // see what changed in our follows so we can update the store indexes
  for (let i = 0; i < next.length; i++) {
    const follow = next[i]

    const previousIdx = previous.indexOf(follow)
    if (previousIdx === -1 && follow !== account) {
      // if it's in the new list but wasn't in the old that means it's a new follow
      store.markFollow(account, follow)
    } else {
      // if it's in the new list but also on the previous list, just swap-delete it from there
      previous[previousIdx] = previous[previous.length - 1]
      previous.length = previous.length - 1
    }
  }

  // what remained in previous list is what we unfollowed
  previous.forEach((target) => store.markUnfollow(account, target))
}
