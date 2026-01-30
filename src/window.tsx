import { AbstractRelay } from '@nostr/tools/abstract-relay'
import { loadNostrUser } from '@nostr/gadgets/metadata'
import { loadFollowsList } from '@nostr/gadgets/lists'
import { pool } from '@nostr/gadgets/global'
import { store } from './services/store.service'
import { current, outbox } from './services/outbox.service'
import client from './services/client.service'

const lastSyncTimes = new Map<string, string>()
current.onsync.push((pubkey?: string) => {
  if (!pubkey) return
  lastSyncTimes.set(pubkey, new Date().toISOString())
})
;(window as any).fevela = {
  store,
  client,
  relays() {
    const relays = Array.from((pool as any).relays.values()) as AbstractRelay[]

    const connected = relays.filter((r) => r.connected).length
    const withSubs = relays.filter((r) => r.openSubs.size > 0).length

    const subsPerRelay = relays.map((r) => ({
      url: r.url.substring(0, 30),
      connected: r.connected,
      subs: r.openSubs.size
    }))

    console.log(
      `relay connections: ${connected}/${relays.length} connected, ${withSubs} with active subs`
    )
    console.table(subsPerRelay)
  },
  async outbox() {
    if (!this.account) {
      console.log('no account connected')
      return
    }

    const followings = (await loadFollowsList(this.account)).items
    const currentPubkeys = [this.account, ...followings]
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
          boundStart: bounds ? new Date(bounds[pubkey]?.[0]).toISOString() : 'none',
          boundEnd: bounds ? new Date(bounds[pubkey]?.[1]).toISOString() : 'none'
        }
        tableData.push(row)
      })
    )

    tableData.sort((a, b) => b.timestamp - a.timestamp)

    console.log('current outbox database timestamps')
    console.table(tableData)
  },
  async sync() {
    if (!this.account) {
      console.log('no account connected')
      return
    }

    const followings = (await loadFollowsList(this.account)).items
    const currentPubkeys = [this.account, ...followings]

    const currentlySyncing = (outbox as any).currentlySyncing as Map<string, () => void>
    const permanentlyLive = (outbox as any).permanentlyLive as Set<string>

    const liveSubs = (outbox as any).liveSubscriptions as Map<string, any>

    const tableData: any[] = []

    await Promise.all(
      currentPubkeys.map(async (pubkey) => {
        const meta = await loadNostrUser(pubkey)
        let relays: string[] = []
        for (const [pk, subscription] of liveSubs) {
          if (pk === pubkey) {
            relays = subscription.filters?.flatMap((f: any) => f.relays || []) || []
            break
          }
        }

        const row = {
          name: meta.shortName,
          syncing: currentlySyncing.has(pubkey),
          lastSync: lastSyncTimes.get(pubkey) || 'none',
          live: permanentlyLive.has(pubkey),
          relays: relays.length > 0 ? relays.join(', ') : 'none'
        }
        tableData.push(row)
      })
    )

    console.log('current outbox syncing status')
    console.table(tableData)
  }
}
