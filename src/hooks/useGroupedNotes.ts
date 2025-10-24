import { getTimeFrameInMs, useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { isReplyNoteEvent } from '@/lib/event'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { usePinBury } from '@/providers/PinBuryProvider'

export type TGroupedNote = {
  note: Event
  totalNotesInTimeframe: number
  oldestTimestamp: number
  newestTimestamp: number
  allNoteTimestamps: number[]
}

export function useGroupedNotesProcessing(
  events: Event[],
  showKinds: number[]
): {
  processedEvents: Event[]
  groupedNotesData: Map<string, TGroupedNote>
  hasNoResults: boolean
} {
  const { settings } = useGroupedNotes()
  const { getPinBuryState } = usePinBury()

  return useMemo(() => {
    if (!settings.enabled) {
      return {
        processedEvents: events,
        groupedNotesData: new Map(),
        hasNoResults: false
      }
    }

    const now = Date.now()
    const timeframeMs = getTimeFrameInMs(settings.timeFrame)
    const cutoffTime = Math.floor((now - timeframeMs) / 1000)

    // Step 1: Filter events within timeframe and matching content types
    let eventsInTimeframe = events.filter(event =>
      event.created_at >= cutoffTime && showKinds.includes(event.kind)
    )

    // Step 1.5: Filter out replies if includeReplies is false
    if (!settings.includeReplies) {
      eventsInTimeframe = eventsInTimeframe.filter(event => !isReplyNoteEvent(event))
    }

    // Step 1.6: Filter by word filter (content and hashtags)
    if (settings.wordFilter.trim()) {
      const filterWords = settings.wordFilter
        .split(',')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0)

      if (filterWords.length > 0) {
        eventsInTimeframe = eventsInTimeframe.filter(event => {
          // Get content in lowercase for case-insensitive matching
          const content = (event.content || '').toLowerCase()

          // Get hashtags from tags
          const hashtags = event.tags
            .filter(tag => tag[0] === 't' && tag[1])
            .map(tag => tag[1].toLowerCase())

          // Check if any filter word matches content or hashtags
          const hasMatchInContent = filterWords.some(word => content.includes(word))
          const hasMatchInHashtags = filterWords.some(word =>
            hashtags.some(hashtag => hashtag.includes(word))
          )

          // Return true to KEEP the event (filter OUT events that match)
          return !hasMatchInContent && !hasMatchInHashtags
        })
      }
    }

    // Step 1.7: Filter out short notes (single words or less than 10 characters)
    if (settings.hideShortNotes) {
      eventsInTimeframe = eventsInTimeframe.filter(event => {
        const content = (event.content || '').trim()

        // Filter out if content is less than 10 characters
        if (content.length < 10) {
          return false
        }

        // Filter out emoji-only notes
        // Remove emojis and check if there's any substantial text left
        // Using Unicode property escapes to match all emoji characters
        const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
        const contentWithoutEmojis = content.replace(emojiRegex, '').replace(/\s+/g, '').trim()
        if (contentWithoutEmojis.length < 2) {
          return false
        }

        // Filter out single words (no spaces or only one word)
        const words = content.split(/\s+/).filter(word => word.length > 0)
        if (words.length === 1) {
          return false
        }

        return true
      })
    }

    // Step 2: Group events by author pubkey
    const eventsByAuthor = new Map<string, Event[]>()
    eventsInTimeframe.forEach(event => {
      if (!eventsByAuthor.has(event.pubkey)) {
        eventsByAuthor.set(event.pubkey, [])
      }
      eventsByAuthor.get(event.pubkey)!.push(event)
    })

    // Step 3: Apply activity level filter
    const authorsThatPassFilter = new Map<string, Event[]>()
    eventsByAuthor.forEach((authorEvents, pubkey) => {
      const eventCount = authorEvents.length
      if (settings.maxNotesFilter === 0 || eventCount <= settings.maxNotesFilter) {
        authorsThatPassFilter.set(pubkey, authorEvents)
      }
    })

    // Step 4: Get the latest note from each author
    const groupedNotesData = new Map<string, TGroupedNote>()
    const latestNotes: Event[] = []

    authorsThatPassFilter.forEach((authorEvents) => {
      // Sort by created_at descending and take the latest
      const sortedEvents = authorEvents.sort((a, b) => b.created_at - a.created_at)
      const latestNote = sortedEvents[0]
      const oldestNote = sortedEvents[sortedEvents.length - 1]
      const allTimestamps = sortedEvents.map(e => e.created_at)

      latestNotes.push(latestNote)
      groupedNotesData.set(latestNote.id, {
        note: latestNote,
        totalNotesInTimeframe: authorEvents.length,
        oldestTimestamp: oldestNote.created_at,
        newestTimestamp: latestNote.created_at,
        allNoteTimestamps: allTimestamps
      })
    })

    // Step 5: Sort final notes by pin/bury state, then by created_at descending
    const processedEvents = latestNotes.sort((a, b) => {
      const stateA = getPinBuryState(a.pubkey)
      const stateB = getPinBuryState(b.pubkey)

      // Pinned users come first
      if (stateA === 'pinned' && stateB !== 'pinned') return -1
      if (stateA !== 'pinned' && stateB === 'pinned') return 1

      // Buried users come last
      if (stateA === 'buried' && stateB !== 'buried') return 1
      if (stateA !== 'buried' && stateB === 'buried') return -1

      // Within the same group, sort by created_at descending
      return b.created_at - a.created_at
    })

    const hasNoResults = processedEvents.length === 0 && eventsInTimeframe.length > 0

    return {
      processedEvents,
      groupedNotesData,
      hasNoResults
    }
  }, [events, showKinds, settings, getPinBuryState])
}