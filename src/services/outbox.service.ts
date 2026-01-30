import { BIG_RELAY_URLS, SUPPORTED_KINDS } from '@/constants'
import { pool } from '@nostr/gadgets/global'
import { OutboxManager } from '@nostr/gadgets/outbox'
import { NostrEvent } from '@nostr/tools/core'
import { store } from './store.service'

export const outbox = new OutboxManager([{ kinds: SUPPORTED_KINDS }], store, {
  pool,
  label: 'fevela',
  onsyncupdate(pubkey) {
    console.debug(':: synced updating', pubkey)
    for (let i = 0; i < current.onsync.length; i++) {
      current.onsync[i](pubkey)
    }
  },
  onbeforeupdate(pubkey) {
    for (let i = 0; i < current.onsync.length; i++) {
      current.onsync[i](pubkey)
    }
  },
  onliveupdate(event) {
    console.debug(':: live', event)
    for (let i = 0; i < current.onnew.length; i++) {
      current.onnew[i](event)
    }
  },
  defaultRelaysForConfusedPeople: BIG_RELAY_URLS,
  storeRelaysSeenOn: true
})

export const status: { syncing: true; pubkey: string } | { syncing: undefined | false } = {
  syncing: undefined
}

export function end() {
  outbox.close()
}

export const current: {
  onsync: Array<(pubkey?: string) => void>
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

  status.syncing = true
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = account

  const targets = [account, ...followings]
  isStarted(targets.length)

  if (0 === (await store.queryEvents({}, 1)).length) {
    // this means the database has no events.
    // let's wait some time to do our first sync, as the user right now is likely to
    // be doing the preliminary fallback query and we don't want to interfere with it
    await new Promise((resolve) => setTimeout(resolve, 15000))
  }

  const hasNew = await outbox.sync(targets, {
    signal
  })

  if (hasNew) {
    for (let i = 0; i < current.onsync.length; i++) {
      current.onsync[i]()
    }
  }

  status.syncing = false
  isReady()

  outbox.live(targets, { signal: undefined })
}
