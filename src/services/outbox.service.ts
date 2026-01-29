import { BIG_RELAY_URLS, SUPPORTED_KINDS } from '@/constants'
import { pool } from '@nostr/gadgets/global'
import { OutboxManager } from '@nostr/gadgets/outbox'
import { NostrEvent } from '@nostr/tools/core'
import { store } from './store.service'
import { loadNostrUser } from '@nostr/gadgets/metadata'

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
  ;(window as any).fevelaOutbox = async () => {
    console.log('current outbox syncing status')

    if (!outbox) {
      console.log('outbox not initialized')
      return
    }

    const currentPubkeys = [account, ...followings]
    const tableData: any[] = []

    const bounds = await store.getOutboxBounds()

    await Promise.all(
      currentPubkeys.map(async (pubkey) => {
        const latestEvent = await store.queryEvents({ authors: [pubkey], kinds: [1] }, 1)
        const meta = await loadNostrUser(pubkey)
        const row = {
          name: meta.shortName,
          date:
            latestEvent.length > 0
              ? new Date(latestEvent[0].created_at * 1000).toISOString()
              : 'none',
          timestamp: latestEvent[0]?.created_at || 0,
          boundStart: bounds[pubkey]?.[0],
          boundEnd: bounds[pubkey]?.[1]
        }
        tableData.push(row)
      })
    )

    tableData.sort((a, b) => b.timestamp - a.timestamp)

    console.table(tableData)
  }

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
