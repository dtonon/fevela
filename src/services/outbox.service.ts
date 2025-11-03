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

export async function start(pubkey: string, signal: AbortSignal) {
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
    defaultRelaysForConfusedPeople: BIG_RELAY_URLS
  })

  status.syncing = true
  ;(status as Extract<typeof status, { syncing: true }>).pubkey = pubkey

  const following = await loadFollowsList(pubkey)
  const targets = [pubkey, ...following.items]

  const hasNew = await outbox.sync(targets, {
    signal
  })

  if (hasNew) {
    current.onsync?.()
  }

  outbox.live(targets, { signal: undefined })
}
