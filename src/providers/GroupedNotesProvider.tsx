import { createContext, useContext, useState } from 'react'

export type TTimeFrame = {
  value: number
  unit: 'hours' | 'days'
  label: string
}

export const TIME_FRAME_OPTIONS: TTimeFrame[] = [
  // Hours: 1-24
  ...Array.from({ length: 24 }, (_, i) => ({
    value: i + 1,
    unit: 'hours' as const,
    label: `${i + 1} ${i + 1 === 1 ? 'hour' : 'hours'}`
  })),
  // Days: 2-30
  ...Array.from({ length: 29 }, (_, i) => ({
    value: i + 2,
    unit: 'days' as const,
    label: `${i + 2} days`
  }))
]

export type TGroupedNotesSettings = {
  enabled: boolean
  timeFrame: TTimeFrame
  maxNotesFilter: number // 0 means disabled
  compactedView: boolean
}

type TGroupedNotesContext = {
  settings: TGroupedNotesSettings
  updateSettings: (settings: Partial<TGroupedNotesSettings>) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: TGroupedNotesSettings = {
  enabled: false,
  timeFrame: TIME_FRAME_OPTIONS[23], // 24 hours
  maxNotesFilter: 0, // Disabled
  compactedView: false
}

const GroupedNotesContext = createContext<TGroupedNotesContext | undefined>(undefined)

export const useGroupedNotes = () => {
  const context = useContext(GroupedNotesContext)
  if (!context) {
    throw new Error('useGroupedNotes must be used within a GroupedNotesProvider')
  }
  return context
}

export function GroupedNotesProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<TGroupedNotesSettings>(DEFAULT_SETTINGS)

  const updateSettings = (newSettings: Partial<TGroupedNotesSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  return (
    <GroupedNotesContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </GroupedNotesContext.Provider>
  )
}

export function getTimeFrameInMs(timeFrame: TTimeFrame): number {
  const multiplier = timeFrame.unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return timeFrame.value * multiplier
}