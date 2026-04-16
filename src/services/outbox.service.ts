import { SUPPORTED_KINDS } from '@/constants'
import { pool } from '@nostr/gadgets/global'
import { OutboxManager } from '@nostr/gadgets/outbox'
import { NostrEvent } from '@nostr/tools/core'
import { store } from './store.service'

export let outbox: OutboxManager
setTimeout(() => {
  outbox = new OutboxManager([{ kinds: SUPPORTED_KINDS }], store, {
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
    defaultRelaysForConfusedPeople: window.fevela.universe.bigRelayUrls,
    storeRelaysSeenOn: true
  })
}, 0)

export const status: { syncing: true; pubkey: string } | { syncing: undefined | false } = {
  syncing: undefined
}

export function end() {
  outbox.close()
}

let liveTargets: string[] = []
let startSignal: AbortSignal | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined

export function restart() {
  if (!liveTargets.length) return

  resetPromises()

  clearInterval(refreshTimer)
  outbox.close()
  startInternal()

  refreshTimer = setInterval(restart, 1000 * 60 * 10 /* 10 minutes */)
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
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = account

  resetPromises()

  liveTargets = [account, ...followings]
  startSignal = signal

  clearInterval(refreshTimer)
  startInternal()
  refreshTimer = setInterval(restart, 1000 * 60 * 10 /* 10 minutes */)
}

async function startInternal() {
  startSignal!.onabort = () => {
    status.syncing = undefined
  }

  status.syncing = true
  startedListeners.forEach((cb) => cb(liveTargets.length))

  if (0 === (await store.queryEvents({}, 1)).length) {
    // this means the database has no events.
    // let's wait some time to do our first sync, as the user right now is likely to
    // be doing the preliminary fallback query and we don't want to interfere with it
    await new Promise((resolve) => setTimeout(resolve, 15000))
  }

  const hasNew = await outbox.sync(liveTargets, {
    signal: startSignal!
  })

  if (hasNew) {
    for (let i = 0; i < current.onsync.length; i++) {
      current.onsync[i]()
    }
  }

  status.syncing = false
  isReady()

  outbox.live(liveTargets, { signal: undefined })
}
