import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'groupedNotesReadStatus'

type ReadStatus = {
  timestamp: number
  onlyLast: boolean
  countAtRead: number
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

  const markLastNoteRead = useCallback((pubkey: string, newestNoteTimestamp: number, currentCount: number) => {
    setReadStatusMap(prev => ({
      ...prev,
      [pubkey]: {
        timestamp: newestNoteTimestamp,
        onlyLast: true,
        countAtRead: currentCount
      }
    }))
  }, [])

  const markAllNotesRead = useCallback((pubkey: string, newestNoteTimestamp: number, currentCount: number) => {
    setReadStatusMap(prev => ({
      ...prev,
      [pubkey]: {
        timestamp: newestNoteTimestamp,
        onlyLast: false,
        countAtRead: currentCount
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

  const getUnreadCount = useCallback((pubkey: string, allNoteTimestamps: number[]) => {
    const status = readStatusMap[pubkey]
    if (!status) {
      return allNoteTimestamps.length
    }

    // Count notes newer than the read timestamp
    const newUnreadCount = allNoteTimestamps.filter(timestamp => timestamp > status.timestamp).length

    // If there are new unread notes, return that count
    if (newUnreadCount > 0) {
      return newUnreadCount
    }

    // Otherwise, return the frozen count from when it was marked as read
    return status.countAtRead
  }, [readStatusMap])

  return {
    markLastNoteRead,
    markAllNotesRead,
    getReadStatus,
    getUnreadCount
  }
}