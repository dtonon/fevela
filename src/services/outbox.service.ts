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
  onbeforeupdate(_pubkey) {},
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
let _ready: Promise<void>

function resetPromises() {
  _ready = new Promise<void>((resolve) => {
    isReady = resolve
  })
}

resetPromises()

export async function ready(): Promise<void> {
  return _ready
}

const startedListeners: ((len: number) => void)[] = []
export function onStarted(cb: (len: number) => void) {
  startedListeners.push(cb)
}

export async function start(account: string, followings: string[], signal: AbortSignal) {
  // reset promises for new sync session
  resetPromises()

  signal.onabort = () => {
    status.syncing = undefined
  }

  status.syncing = true
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = account

  const targets = [account, ...followings]
  startedListeners.forEach((cb) => cb(targets.length))

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
