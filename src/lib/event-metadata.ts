import { POLL_TYPE } from '@/constants'
import { TPollType, TRelayList } from '@/types'
import { Event } from '@nostr/tools/wasm'
import { tagNameEquals } from './tag'
import { isWebsocketUrl, normalizeUrl } from './url'
import { isTorBrowser } from './utils'
import { NostrUser } from '@nostr/gadgets/metadata'
import { RelayItem } from '@nostr/gadgets/lists'

export function buildRelayList(items: RelayItem[]) {
  if (items.length === 0) {
    return {
      write: window.fevela.universe.bigRelayUrls,
      read: window.fevela.universe.bigRelayUrls,
      originalRelays: []
    }
  }

  const torBrowserDetected = isTorBrowser()
  const relayList = { write: [], read: [], originalRelays: [] } as TRelayList
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.url || !isWebsocketUrl(item.url)) return

    const normalizedUrl = normalizeUrl(item.url)
    if (!normalizedUrl) return

    const scope = item.read && item.write ? 'both' : item.write ? 'write' : 'read'
    relayList.originalRelays.push({ url: normalizedUrl, scope })

    // Filter out .onion URLs if not using Tor browser
    if (normalizedUrl.endsWith('.onion/') && !torBrowserDetected) return

    if (item.write) {
      relayList.write.push(normalizedUrl)
    } else if (item.read) {
      relayList.read.push(normalizedUrl)
    } else {
      relayList.write.push(normalizedUrl)
      relayList.read.push(normalizedUrl)
    }
  }

  // If there are too many relays, use the default bigRelayUrls
  // Because they don't know anything about relays, their settings cannot be trusted
  return {
    write:
      relayList.write.length && relayList.write.length <= 8
        ? relayList.write
        : window.fevela.universe.bigRelayUrls,
    read:
      relayList.read.length && relayList.write.length <= 8
        ? relayList.read
        : window.fevela.universe.bigRelayUrls,
    originalRelays: relayList.originalRelays
  }
}

export function username(profile: NostrUser): string {
  const { name, display_name, nip05, website } = profile.metadata || {}
  return name || display_name || nip05?.split?.('@')?.[0] || website, profile?.shortName
}

export function getLongFormArticleMetadataFromEvent(event: Event) {
  let title: string | undefined
  let summary: string | undefined
  let image: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'title') {
      title = tagValue
    } else if (tagName === 'summary') {
      summary = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    } else if (tagName === 't' && tagValue && tags.size < 6) {
      tags.add(tagValue.toLocaleLowerCase())
    }
  })

  if (!title) {
    title = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no title'
  }

  return { title, summary, image, tags: Array.from(tags) }
}

export function getLiveEventMetadataFromEvent(event: Event) {
  let title: string | undefined
  let summary: string | undefined
  let image: string | undefined
  let status: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'title') {
      title = tagValue
    } else if (tagName === 'summary') {
      summary = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    } else if (tagName === 'status') {
      status = tagValue
    } else if (tagName === 't' && tagValue && tags.size < 6) {
      tags.add(tagValue.toLocaleLowerCase())
    }
  })

  if (!title) {
    title = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no title'
  }

  return { title, summary, image, status, tags: Array.from(tags) }
}

export function getGroupMetadataFromEvent(event: Event) {
  let d: string | undefined
  let name: string | undefined
  let about: string | undefined
  let picture: string | undefined
  const tags = new Set<string>()

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'name') {
      name = tagValue
    } else if (tagName === 'about') {
      about = tagValue
    } else if (tagName === 'picture') {
      picture = tagValue
    } else if (tagName === 't' && tagValue) {
      tags.add(tagValue.toLocaleLowerCase())
    } else if (tagName === 'd') {
      d = tagValue
    }
  })

  if (!name) {
    name = d ?? 'no name'
  }

  return { d, name, about, picture, tags: Array.from(tags) }
}

export function getCommunityDefinitionFromEvent(event: Event) {
  let name: string | undefined
  let description: string | undefined
  let image: string | undefined

  event.tags.forEach(([tagName, tagValue]) => {
    if (tagName === 'name') {
      name = tagValue
    } else if (tagName === 'description') {
      description = tagValue
    } else if (tagName === 'image') {
      image = tagValue
    }
  })

  if (!name) {
    name = event.tags.find(tagNameEquals('d'))?.[1] ?? 'no name'
  }

  return { name, description, image }
}

export function getPollMetadataFromEvent(event: Event) {
  const options: { id: string; label: string }[] = []
  const relayUrls: string[] = []
  let pollType: TPollType = POLL_TYPE.SINGLE_CHOICE
  let endsAt: number | undefined

  for (const [tagName, ...tagValues] of event.tags) {
    if (tagName === 'option' && tagValues.length >= 2) {
      const [optionId, label] = tagValues
      if (optionId && label) {
        options.push({ id: optionId, label })
      }
    } else if (tagName === 'relay' && tagValues[0]) {
      const normalizedUrl = normalizeUrl(tagValues[0])
      if (normalizedUrl) relayUrls.push(tagValues[0])
    } else if (tagName === 'polltype' && tagValues[0]) {
      if (tagValues[0] === POLL_TYPE.MULTIPLE_CHOICE) {
        pollType = POLL_TYPE.MULTIPLE_CHOICE
      }
    } else if (tagName === 'endsAt' && tagValues[0]) {
      const timestamp = parseInt(tagValues[0])
      if (!isNaN(timestamp)) {
        endsAt = timestamp
      }
    }
  }

  if (options.length === 0) {
    return null
  }

  return {
    options,
    pollType,
    relayUrls,
    endsAt
  }
}

export function getPollResponseFromEvent(
  event: Event,
  optionIds: string[],
  isMultipleChoice: boolean
) {
  const selectedOptionIds: string[] = []

  for (const [tagName, ...tagValues] of event.tags) {
    if (tagName === 'response' && tagValues[0]) {
      if (optionIds && !optionIds.includes(tagValues[0])) {
        continue // Skip if the response is not in the provided optionIds
      }
      selectedOptionIds.push(tagValues[0])
    }
  }

  // If no valid responses are found, return null
  if (selectedOptionIds.length === 0) {
    return null
  }

  // If multiple responses are selected but the poll is not multiple choice, return null
  if (selectedOptionIds.length > 1 && !isMultipleChoice) {
    return null
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    selectedOptionIds,
    created_at: event.created_at
  }
}

export function getStarsFromRelayReviewEvent(event: Event): number {
  const ratingTag = event.tags.find((t) => t[0] === 'rating')
  if (ratingTag) {
    const stars = parseFloat(ratingTag[1]) * 5
    if (stars > 0 && stars <= 5) {
      return stars
    }
  }
  return 0
}
