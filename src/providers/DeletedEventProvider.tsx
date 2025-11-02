import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { NostrEvent } from '@nostr/tools/pure'
import { createContext, useCallback, useContext, useState } from 'react'

type TDeletedEventContext = {
  addDeletedEvent: (event: NostrEvent) => void
  isEventDeleted: (event: NostrEvent) => boolean
}

const DeletedEventContext = createContext<TDeletedEventContext | undefined>(undefined)

export const useDeletedEvent = () => {
  const context = useContext(DeletedEventContext)
  if (!context) {
    throw new Error('useDeletedEvent must be used within a DeletedEventProvider')
  }
  return context
}

export function DeletedEventProvider({ children }: { children: React.ReactNode }) {
  const [deletedEventKeys, setDeletedEventKeys] = useState<Set<string>>(new Set())

  const isEventDeleted = useCallback(
    (event: NostrEvent) => {
      return deletedEventKeys.has(getKey(event))
    },
    [deletedEventKeys]
  )

  const addDeletedEvent = (event: NostrEvent) => {
    setDeletedEventKeys((prev) => new Set(prev).add(getKey(event)))
  }

  return (
    <DeletedEventContext.Provider value={{ addDeletedEvent, isEventDeleted }}>
      {children}
    </DeletedEventContext.Provider>
  )
}

function getKey(event: NostrEvent) {
  return isReplaceableEvent(event.kind) ? getReplaceableCoordinateFromEvent(event) : event.id
}
