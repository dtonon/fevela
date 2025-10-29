import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type TPinBuryState = 'pinned' | 'buried' | null

type TPinBuryMap = Record<string, TPinBuryState>

interface IPinBuryContext {
  getPinBuryState: (pubkey: string) => TPinBuryState
  setPinned: (pubkey: string) => void
  setBuried: (pubkey: string) => void
  clearState: (pubkey: string) => void
}

const PinBuryContext = createContext<IPinBuryContext | undefined>(undefined)

const STORAGE_KEY = 'jumble:pinBury'

export const PinBuryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pinBuryMap, setPinBuryMap] = useState<TPinBuryMap>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error('Failed to load pin/bury state from localStorage:', error)
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinBuryMap))
    } catch (error) {
      console.error('Failed to save pin/bury state to localStorage:', error)
    }
  }, [pinBuryMap])

  const getPinBuryState = (pubkey: string): TPinBuryState => {
    return pinBuryMap[pubkey] || null
  }

  const setPinned = (pubkey: string) => {
    setPinBuryMap((prev) => ({
      ...prev,
      [pubkey]: 'pinned',
    }))
  }

  const setBuried = (pubkey: string) => {
    setPinBuryMap((prev) => ({
      ...prev,
      [pubkey]: 'buried',
    }))
  }

  const clearState = (pubkey: string) => {
    setPinBuryMap((prev) => {
      const newMap = { ...prev }
      delete newMap[pubkey]
      return newMap
    })
  }

  return (
    <PinBuryContext.Provider
      value={{
        getPinBuryState,
        setPinned,
        setBuried,
        clearState,
      }}
    >
      {children}
    </PinBuryContext.Provider>
  )
}

export const usePinBury = (): IPinBuryContext => {
  const context = useContext(PinBuryContext)
  if (!context) {
    throw new Error('usePinBury must be used within a PinBuryProvider')
  }
  return context
}
