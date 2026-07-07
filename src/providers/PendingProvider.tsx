import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
  useRef
} from 'react'
import { NostrEvent } from '@nostr/tools/wasm'
import { StorageKey } from '@/constants'
import { store } from '@/services/store.service'

export type TPendingReason = 'draft' | 'error'

type TPendingItem = { id: string; reason: TPendingReason }

type PendingContextType = {
  pendingIds: string[]
  pendingEvents: NostrEvent[]
  pendingReasons: Record<string, TPendingReason>
  savePendingEvent: (event: NostrEvent, reason?: TPendingReason) => void
  discardPendingEvent: (eventId: string) => void
}

const PendingContext = createContext<PendingContextType | undefined>(undefined)

function readPendingItems(): TPendingItem[] {
  if (typeof window === 'undefined') return []
  const stored = window.localStorage.getItem(StorageKey.PENDING)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((v): TPendingItem[] => {
      // Legacy format stored plain id strings
      if (typeof v === 'string') return [{ id: v, reason: 'draft' }]
      if (v && typeof v.id === 'string') {
        return [{ id: v.id, reason: v.reason === 'error' ? 'error' : 'draft' }]
      }
      return []
    })
  } catch {
    return []
  }
}

export function PendingProvider({ children }: { children: ReactNode }) {
  const [pendingItems, setPendingItems] = useState<TPendingItem[]>(readPendingItems)
  const [pendingEvents, setPendingEvents] = useState<NostrEvent[]>([])
  const isInitialMount = useRef(true)

  const pendingIds = useMemo(() => pendingItems.map((item) => item.id), [pendingItems])
  const pendingReasons = useMemo(
    () => Object.fromEntries(pendingItems.map((item) => [item.id, item.reason])),
    [pendingItems]
  )

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
    async (event: NostrEvent, reason: TPendingReason = 'error') => {
      await store.saveEvent(event)
      setPendingItems((prev) => {
        const existing = prev.find((item) => item.id === event.id)
        if (existing?.reason === reason) return prev
        const next = existing
          ? prev.map((item) => (item.id === event.id ? { ...item, reason } : item))
          : [{ id: event.id, reason }, ...prev]
        window.localStorage.setItem(StorageKey.PENDING, JSON.stringify(next))
        loadEvents(next.map((item) => item.id))
        return next
      })
    },
    [loadEvents]
  )

  const discardPendingEvent = useCallback(
    async (eventId: string) => {
      await store.deleteEvents([eventId])
      setPendingItems((prev) => {
        if (!prev.some((item) => item.id === eventId)) return prev
        const next = prev.filter((item) => item.id !== eventId)
        window.localStorage.setItem(StorageKey.PENDING, JSON.stringify(next))
        loadEvents(next.map((item) => item.id))
        return next
      })
    },
    [loadEvents]
  )

  return (
    <PendingContext.Provider
      value={{ pendingIds, pendingEvents, pendingReasons, savePendingEvent, discardPendingEvent }}
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
