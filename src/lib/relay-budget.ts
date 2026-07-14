import { Filter } from '@nostr/tools/filter'
import { normalizeUrl } from './url'

export type TSubRequest = { url: string; filter: Filter }

// How many websockets a single subscribeMap() call may spread itself over.
// The outbox model naturally wants one connection per relay named by any followed
// author, which for a few hundred follows means 100+ permanent sockets. Firefox caps
// the whole browser at 200 (network.websocket.max-connections), so we have to be frugal.
export const SUBSCRIPTION_RELAY_BUDGET = 24

// Slots always kept for author-based requests, even if authorless ones already fill the
// budget on their own.
const MIN_AUTHORED_RELAYS = 3

// A filter without its `authors` field identifies a "shape": two requests with the same
// shape can be served by the same relay with the authors merged into one filter.
function shapeKey(filter: Filter): string {
  const { authors: _authors, ...rest } = filter
  const keys = Object.keys(rest).sort()
  return JSON.stringify(keys.map((k) => [k, (rest as Record<string, unknown>)[k]]))
}

/**
 * Reduces an outbox-style subscription map to at most `budget` distinct relays.
 *
 * Greedy set cover: repeatedly pick the relay that serves the largest number of
 * still-uncovered (author, filter shape) pairs. Relays that only a handful of authors
 * name get dropped, and those authors are moved onto the busiest relay we did keep - not
 * necessarily one they listed, so their events may not show up there, but that beats
 * dropping them outright. Requests whose filter has no `authors` are never dropped.
 */
export function compressSubRequests(
  requests: TSubRequest[],
  budget: number = SUBSCRIPTION_RELAY_BUDGET
): TSubRequest[] {
  const passthrough: TSubRequest[] = []
  const byUrl = new Map<string, Map<string, { filter: Filter; authors: Set<string> }>>()

  for (const req of requests) {
    const url = normalizeUrl(req.url)
    if (!url) continue

    if (!req.filter.authors?.length) {
      passthrough.push({ url, filter: req.filter })
      continue
    }

    let shapes = byUrl.get(url)
    if (!shapes) {
      shapes = new Map()
      byUrl.set(url, shapes)
    }
    const key = shapeKey(req.filter)
    let entry = shapes.get(key)
    if (!entry) {
      entry = { filter: req.filter, authors: new Set() }
      shapes.set(key, entry)
    }
    for (const author of req.filter.authors) entry.authors.add(author)
  }

  const mandatory = new Set(passthrough.map((r) => r.url))
  // Authorless requests are kept unconditionally, but they must never squeeze the
  // outbox ones out entirely: always leave a few slots so no author is lost. The pool's
  // connection ceiling is the real backstop if this overshoots.
  const remaining = byUrl.size === 0 ? 0 : Math.max(MIN_AUTHORED_RELAYS, budget - mandatory.size)
  if (byUrl.size <= remaining) {
    return keepNonEmpty(passthrough.concat(flatten(byUrl)), requests)
  }

  // covered.get(shapeKey)!.get(author) === true once some chosen relay serves that pair
  const covered = new Map<string, Set<string>>()
  const chosen = new Map<string, Map<string, { filter: Filter; authors: Set<string> }>>()

  const gainOf = (shapes: Map<string, { filter: Filter; authors: Set<string> }>) => {
    let gain = 0
    for (const [key, { authors }] of shapes) {
      const done = covered.get(key)
      for (const author of authors) {
        if (!done?.has(author)) gain++
      }
    }
    return gain
  }

  while (chosen.size < remaining) {
    let bestUrl: string | undefined
    let bestGain = 0
    for (const [url, shapes] of byUrl) {
      if (chosen.has(url)) continue
      const gain = gainOf(shapes)
      if (gain > bestGain) {
        bestGain = gain
        bestUrl = url
      }
    }
    if (!bestUrl) break

    const shapes = byUrl.get(bestUrl)!
    chosen.set(bestUrl, shapes)
    for (const [key, { authors }] of shapes) {
      let done = covered.get(key)
      if (!done) {
        done = new Set()
        covered.set(key, done)
      }
      for (const author of authors) done.add(author)
    }
  }

  // Authors nobody covered (their relays all lost the budget race) go onto the relay that
  // already carries the most authors for that shape, so they are not silently dropped.
  for (const [_url, shapes] of byUrl) {
    for (const [key, { filter, authors }] of shapes) {
      const done = covered.get(key)
      const orphans = Array.from(authors).filter((a) => !done?.has(a))
      if (!orphans.length) continue

      let fallback: { filter: Filter; authors: Set<string> } | undefined
      for (const chosenShapes of chosen.values()) {
        const candidate = chosenShapes.get(key)
        if (candidate && (!fallback || candidate.authors.size > fallback.authors.size)) {
          fallback = candidate
        }
      }
      if (!fallback) {
        // nothing chosen for this shape at all: keep the original request
        const first = chosen.values().next().value
        if (first) first.set(key, { filter, authors: new Set(orphans) })
        continue
      }

      let doneSet = covered.get(key)
      if (!doneSet) {
        doneSet = new Set()
        covered.set(key, doneSet)
      }
      for (const author of orphans) {
        fallback.authors.add(author)
        doneSet.add(author)
      }
    }
  }

  return keepNonEmpty(passthrough.concat(flatten(chosen)), requests)
}

/**
 * subscribeMap() with an empty request list never fires oneose or onclose, so a caller
 * awaiting either would hang forever. If we managed to compress everything away (all
 * urls unparseable, say), hand the originals back and let the pool reject them properly.
 */
function keepNonEmpty(result: TSubRequest[], original: TSubRequest[]): TSubRequest[] {
  return result.length || !original.length ? result : original
}

function flatten(
  byUrl: Map<string, Map<string, { filter: Filter; authors: Set<string> }>>
): TSubRequest[] {
  const out: TSubRequest[] = []
  for (const [url, shapes] of byUrl) {
    for (const { filter, authors } of shapes.values()) {
      out.push({ url, filter: { ...filter, authors: Array.from(authors) } })
    }
  }
  return out
}
