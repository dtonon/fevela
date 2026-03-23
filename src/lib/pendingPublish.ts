import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'

type PendingEntry = { endAt: number; onUndo: () => void }

const map = new Map<string, PendingEntry>()
const listeners = new Set<() => void>()
let snapshot = new Map<string, PendingEntry>()

function notify() {
  snapshot = new Map(map)
  listeners.forEach((l) => l())
}

export function addPendingPublish(id: string, endAt: number, onUndo: () => void) {
  map.set(id, { endAt, onUndo })
  notify()
}

export function removePendingPublish(id: string) {
  map.delete(id)
  notify()
}

export function usePendingPublishMap() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot
  )
}

export function usePendingCountdown(endAt: number) {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  )
  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))
    }, 250)
    return () => window.clearInterval(interval)
  }, [endAt])
  return secondsLeft
}
