import { getTimeFrameInMs, useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'

export type TGroupedNote = {
  note: Event
  totalNotesInTimeframe: number
  oldestTimestamp: number
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
    const eventsInTimeframe = events.filter(event =>
      event.created_at >= cutoffTime && showKinds.includes(event.kind)
    )

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

      latestNotes.push(latestNote)
      groupedNotesData.set(latestNote.id, {
        note: latestNote,
        totalNotesInTimeframe: authorEvents.length,
        oldestTimestamp: oldestNote.created_at
      })
    })

    // Step 5: Sort final notes by created_at descending
    const processedEvents = latestNotes.sort((a, b) => b.created_at - a.created_at)

    const hasNoResults = processedEvents.length === 0 && eventsInTimeframe.length > 0

    return {
      processedEvents,
      groupedNotesData,
      hasNoResults
    }
  }, [events, showKinds, settings])
}