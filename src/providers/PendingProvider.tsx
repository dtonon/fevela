import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useRef
} from 'react'
import { NostrEvent } from '@nostr/tools/wasm'
import { StorageKey } from '@/constants'
import { store } from '@/services/store.service'

type PendingContextType = {
  pendingIds: string[]
  pendingEvents: NostrEvent[]
  savePendingEvent: (event: NostrEvent) => void
  discardPendingEvent: (eventId: string) => void
}

const PendingContext = createContext<PendingContextType | undefined>(undefined)

function readPendingIds() {
  if (typeof window === 'undefined') return []
  const stored = window.localStorage.getItem(StorageKey.PENDING)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function PendingProvider({ children }: { children: ReactNode }) {
  const [pendingIds, setPendingIds] = useState<string[]>(readPendingIds)
  const [pendingEvents, setPendingEvents] = useState<NostrEvent[]>([])
  const isInitialMount = useRef(true)

  const loadEvents = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setPendingEvents([])
      return
    }
    const events = await store.queryEvents({ ids: ids }, 5000)
    setPendingEvents(events)
  }, [])

  useEffect(() => {
    if (isInitialMount.current) {
      loadEvents(pendingIds)
      isInitialMount.current = false
    }
  }, [loadEvents, pendingIds])

  const savePendingEvent = useCallback(
    async (event: NostrEvent) => {
      await store.saveEvent(event)
      setPendingIds((prev) => {
        if (prev.includes(event.id)) return prev
        const next = [event.id, ...prev]
        window.localStorage.setItem(StorageKey.PENDING, JSON.stringify(next))
        loadEvents(next)
        return next
      })
    },
    [loadEvents]
  )

  const discardPendingEvent = useCallback(
    async (eventId: string) => {
      await store.deleteEvents([eventId])
      setPendingIds((prev) => {
        if (!prev.includes(eventId)) return prev
        const next = prev.filter((id) => id !== eventId)
        window.localStorage.setItem(StorageKey.PENDING, JSON.stringify(next))
        loadEvents(next)
        return next
      })
    },
    [loadEvents]
  )

  return (
    <PendingContext.Provider
      value={{ pendingIds, pendingEvents, savePendingEvent, discardPendingEvent }}
    >
      {children}
    </PendingContext.Provider>
  )
}

export function usePending() {
  const context = useContext(PendingContext)
  if (!context) {
    throw new Error('usePending must be used within a PendingProvider')
  }
  return context
}
