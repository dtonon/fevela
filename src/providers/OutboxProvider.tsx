import { status, current, ready, started } from '@/services/outbox.service'
import { createContext, useContext, useEffect, useState } from 'react'

type TOutboxContext = {
  syncingStatus: (typeof status)['syncing']
  syncedTotal: number | undefined
  syncedCurrent: number
}

const OutboxContext = createContext<TOutboxContext | undefined>(undefined)

export const useOutboxStatus = () => {
  const context = useContext(OutboxContext)
  if (!context) {
    throw new Error('useOutboxStatus must be used within an OutboxProvider')
  }
  return {
    syncing: context.syncingStatus,
    current: context.syncedCurrent,
    total: context.syncedTotal
  }
}

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const [syncingStatus, setSyncingStatus] = useState(status.syncing)
  const [syncedTotal, setSyncedTotal] = useState<undefined | number>()
  const [syncedCurrent, setSyncedCurrent] = useState(0)

  useEffect(() => {
    started().then(setSyncedTotal)

    started().then(() => {
      setSyncingStatus(status.syncing)
    })

    ready().then(() => {
      setSyncingStatus(status.syncing)
    })

    const handleStatusUpdate = () => {
      setSyncedCurrent((n) => n + 1)
      setSyncingStatus(status.syncing)
    }

    // subscribe to status updates
    current.onsync.push(handleStatusUpdate)

    // cleanup on unmount
    return () => {
      const index = current.onsync.indexOf(handleStatusUpdate)
      if (index > -1) {
        current.onsync.splice(index, 1)
      }
    }
  }, [])

  return (
    <OutboxContext.Provider value={{ syncingStatus, syncedTotal, syncedCurrent }}>
      {children}
    </OutboxContext.Provider>
  )
}
