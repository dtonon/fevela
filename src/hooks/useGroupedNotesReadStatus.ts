import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'groupedNotesReadStatus'

type ReadStatus = {
  timestamp: number
  onlyLast: boolean
}

type ReadStatusMap = Record<string, ReadStatus>

export function useGroupedNotesReadStatus() {
  const [readStatusMap, setReadStatusMap] = useState<ReadStatusMap>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  })

  // Persist to localStorage whenever the map changes
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readStatusMap))
  }, [readStatusMap])

  const markLastNoteRead = useCallback((pubkey: string, newestNoteTimestamp: number) => {
    setReadStatusMap(prev => ({
      ...prev,
      [pubkey]: {
        timestamp: newestNoteTimestamp,
        onlyLast: true
      }
    }))
  }, [])

  const markAllNotesRead = useCallback((pubkey: string, newestNoteTimestamp: number) => {
    setReadStatusMap(prev => ({
      ...prev,
      [pubkey]: {
        timestamp: newestNoteTimestamp,
        onlyLast: false
      }
    }))
  }, [])

  const getReadStatus = useCallback((pubkey: string, newestNoteTimestamp: number) => {
    const status = readStatusMap[pubkey]
    if (!status) {
      return { isLastNoteRead: false, areAllNotesRead: false }
    }

    // If the newest note is newer than our stored timestamp, it's unread
    if (newestNoteTimestamp > status.timestamp) {
      return { isLastNoteRead: false, areAllNotesRead: false }
    }

    // Otherwise, check the onlyLast flag
    return {
      isLastNoteRead: true,
      areAllNotesRead: !status.onlyLast
    }
  }, [readStatusMap])

  return {
    markLastNoteRead,
    markAllNotesRead,
    getReadStatus
  }
}