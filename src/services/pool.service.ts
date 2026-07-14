import { AbstractSimplePool, SubCloser, SubscribeManyParams } from '@nostr/tools/abstract-pool'
import { AbstractRelay } from '@nostr/tools/abstract-relay'
import { Filter } from '@nostr/tools/filter'
import { normalizeURL } from '@nostr/tools/utils'
import { pool } from '@nostr/gadgets/global'
import { compressSubRequests, SUBSCRIPTION_RELAY_BUDGET } from '@/lib/relay-budget'

// The pool keys its relay map with the upstream normalizer, so use the same one here or
// our bookkeeping drifts out of sync with it.
function key(url: string): string {
  try {
    return normalizeURL(url)
  } catch {
    return url
  }
}

// Firefox caps the *whole browser* at 200 concurrent websockets
// (network.websocket.max-connections); Chrome caps 255 per host. Going anywhere near
// that starves every other tab, so we keep a hard ceiling well below it.
export const MAX_CONNECTIONS = 48

// A relay is a candidate for reaping once it has been untouched for this long.
const REAP_GRACE_MS = 15_000

// A disconnected relay we asked for more recently than this is probably still shaking
// hands, not dead.
const CONNECTING_GRACE_MS = 5_000

/**
 * A pool that never holds more than MAX_CONNECTIONS websockets open.
 *
 * Two mechanisms: subscription maps that would fan out over hundreds of relays are
 * compressed to a relay budget before any socket is opened, and when the pool is at the
 * ceiling anyway, idle or dead connections are evicted to make room for new ones.
 */
export class BoundedPool extends AbstractSimplePool {
  public maxConnections = MAX_CONNECTIONS
  public subscriptionRelayBudget = SUBSCRIPTION_RELAY_BUDGET

  private lastUsed = new Map<string, number>()

  subscribeMap(
    requests: { url: string; filter: Filter }[],
    params: SubscribeManyParams
  ): SubCloser {
    const distinct = new Set(requests.map((r) => r.url)).size
    if (distinct > this.subscriptionRelayBudget) {
      const compressed = compressSubRequests(requests, this.subscriptionRelayBudget)
      const after = new Set(compressed.map((r) => r.url)).size
      console.debug(
        `:: [${params.label ?? 'sub'}] relay budget: ${distinct} -> ${after} connections`
      )
      requests = compressed
    }
    return super.subscribeMap(requests, params)
  }

  async ensureRelay(
    url: string,
    params?: { connectionTimeout?: number; abort?: AbortSignal }
  ): Promise<AbstractRelay> {
    const url_ = key(url)
    this.lastUsed.set(url_, Date.now())

    if (!this.relays.has(url_) && this.relays.size >= this.maxConnections) {
      this.evict(this.relays.size - this.maxConnections + 1)
      if (!this.relays.has(url_) && this.relays.size >= this.maxConnections) {
        throw new Error(`connection budget exhausted (${this.maxConnections}), skipping ${url_}`)
      }
    }

    return super.ensureRelay(url, params)
  }

  /** Nothing is riding on this relay: no open subscription, no in-flight publish or auth. */
  private unused(relay: AbstractRelay): boolean {
    if (relay.openSubs.size > 0) return false
    if (relay.ongoingOperations > 0) return false

    // publish() drops ongoingOperations back to 0 as soon as the EVENT is written, so one
    // still waiting for its OK looks idle - ask the pending map instead
    const pending = relay as unknown as {
      openEventPublishes?: Map<string, unknown>
      openCountRequests?: Map<string, unknown>
    }
    return !pending.openEventPublishes?.size && !pending.openCountRequests?.size
  }

  /**
   * Closes up to `count` connections to make room for a new one. Dead sockets that only
   * the reconnect loop still holds go first, then unused ones, least recently used first.
   * Unlike the periodic prune this ignores the reuse grace period: at the ceiling,
   * freeing a slot beats keeping a warm connection nobody is using.
   */
  private evict(count: number): string[] {
    const now = Date.now()
    const dead: string[] = []
    const idle: [string, number][] = []
    const connecting: [string, number][] = []

    for (const [url, relay] of this.relays) {
      if (!this.unused(relay)) continue
      const used = this.lastUsed.get(url) ?? 0

      if (relay.connected) idle.push([url, used])
      else if (now - used >= CONNECTING_GRACE_MS) dead.push(url)
      else connecting.push([url, used])
    }

    idle.sort((a, b) => a[1] - b[1])
    connecting.sort((a, b) => a[1] - b[1])
    const victims = dead
      .concat(idle.map(([url]) => url))
      .concat(connecting.map(([url]) => url))
      .slice(0, count)
    for (const url of victims) this.closeRelay(url)

    if (victims.length) console.debug(':: evicted relays to stay under budget', victims)
    return victims
  }

  private closeRelay(url: string) {
    const relay = this.relays.get(url)
    if (!relay) return
    this.relays.delete(url)
    this.lastUsed.delete(url)
    relay.close()

    // AbstractRelay.close() only closes the socket when it is already OPEN, so a
    // connection still in its handshake would be leaked - which is exactly the socket we
    // are trying to reclaim
    const ws = (relay as unknown as { ws?: WebSocket }).ws
    if (ws && ws.readyState < 2 /* CLOSING */) ws.close()
  }

  /**
   * Same intent as the base implementation, but it also reaps "zombies": relays whose
   * socket died and which the base class keeps forever, because a hard close clears
   * `idleSince` (so the base prune skips them) while the reconnect loop keeps retrying
   * them until the tab is closed.
   */
  pruneIdleRelays(idleThresholdMs: number = 10_000): string[] {
    const now = Date.now()
    const grace = Math.max(idleThresholdMs, REAP_GRACE_MS)
    const pruned: string[] = []

    for (const [url, relay] of this.relays) {
      if (!this.unused(relay)) continue
      // leave a window for a connection to be reused before we throw it away
      if (now - (this.lastUsed.get(url) ?? 0) < REAP_GRACE_MS) continue
      if (relay.connected && relay.idleSince && now - relay.idleSince < grace) continue

      this.closeRelay(url)
      pruned.push(url)
    }

    // the base class drops relays from the map on its own (relay.onclose), so sweep the
    // bookkeeping we keep alongside it
    for (const url of this.lastUsed.keys()) {
      if (!this.relays.has(url)) this.lastUsed.delete(url)
    }

    return pruned
  }

  stats() {
    const relays = Array.from(this.relays.values())
    return {
      open: relays.length,
      connected: relays.filter((r) => r.connected).length,
      withSubs: relays.filter((r) => r.openSubs.size > 0).length,
      max: this.maxConnections
    }
  }
}

/**
 * Reorders relay urls so the ones we already have a socket to come first. Callers that
 * take the first few urls of a list then get their data over existing connections
 * instead of opening new ones.
 */
export function preferOpenConnections(urls: string[]): string[] {
  const open = (pool as unknown as { relays: Map<string, AbstractRelay> }).relays
  return urls
    .map((url, i) => ({ url, i, open: open?.get(key(url))?.connected ?? false }))
    .sort((a, b) => (a.open === b.open ? a.i - b.i : a.open ? -1 : 1))
    .map(({ url }) => url)
}

/** Limits how many async operations of a given kind may be in flight at once. */
export function createLimiter(max: number) {
  let running = 0
  const queue: (() => void)[] = []

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((resolve) => queue.push(resolve))
    running++
    try {
      return await fn()
    } finally {
      running--
      queue.shift()?.()
    }
  }
}
