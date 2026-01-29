import { BIG_RELAY_URLS, SUPPORTED_KINDS } from '@/constants'
import { pool } from '@nostr/gadgets/global'
import { OutboxManager } from '@nostr/gadgets/outbox'
import { RedEventStore } from '@nostr/gadgets/redstore'
import RedStoreWorker from '@nostr/gadgets/redstore/redstore-worker?worker'
import { NostrEvent } from '@nostr/tools/core'

export const store = new RedEventStore(new RedStoreWorker())
export let outbox: OutboxManager

export const status: { syncing: true; pubkey: string } | { syncing: undefined | false } = {
  syncing: undefined
}

export function end() {
  if (outbox) {
    outbox.close()
  }
}

export const current: {
  onsync: Array<() => void>
  onnew: Array<(event: NostrEvent) => void>
} = { onsync: [], onnew: [] }

let isReady: () => void
const _ready = new Promise<void>((resolve) => {
  isReady = resolve
})
export async function ready(): Promise<void> {
  return _ready
}

let isStarted: (total: number) => void
const _started = new Promise<number>((resolve) => {
  isStarted = resolve
})
export async function started(): Promise<number> {
  return _started
}

export async function start(account: string, followings: string[], signal: AbortSignal) {
  signal.onabort = () => {
    status.syncing = undefined
  }

  outbox = new OutboxManager([{ kinds: SUPPORTED_KINDS }], store, {
    pool,
    label: 'fevela',
    onsyncupdate(pubkey) {
      console.debug(':: synced updating', pubkey)
      for (let i = 0; i < current.onsync.length; i++) {
        current.onsync[i]()
      }
    },
    onbeforeupdate(_pubkey) {
      for (let i = 0; i < current.onsync.length; i++) {
        current.onsync[i]()
      }
    },
    onliveupdate(event) {
      console.debug(':: live', event)
      for (let i = 0; i < current.onnew.length; i++) {
        current.onnew[i](event)
      }
    },
    defaultRelaysForConfusedPeople: BIG_RELAY_URLS,
    storeRelaysSeenOn: true,
    authorIsFollowedBy(author: string): string[] | undefined {
      if (author === account || followings.includes(author)) return [account]
    }
  })

  status.syncing = true
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = account

  const targets = [account, ...followings]
  isStarted(targets.length)

  if (!(await store.queryEvents({}, 1)).length) {
    // this means the database has no events.
    // let's wait some time to do our first sync, as the user right now is likely to
    // be doing the preliminary fallback query and we don't want to interfere with it
    await new Promise((resolve) => setTimeout(resolve, 15000))
  }

  const hasNew = await outbox.sync(targets, {
    signal
  })

  status.syncing = false
  isReady()

  if (hasNew) {
    for (let i = 0; i < current.onsync.length; i++) {
      current.onsync[i]()
    }
  }

  outbox.live(targets, { signal: undefined })
}

export function applyDiffFollowedEventsIndex(account: string, previous: string[], next: string[]) {
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

export async function rebuildFollowedEventsIndex(account: string, list: string[]) {
  await store.cleanFollowed(account, list)
  Promise.all(list.map((target) => store.markFollow(account, target)))
}
