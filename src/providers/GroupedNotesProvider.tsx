import { createContext, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import storage from '@/services/local-storage.service'

export type TTimeFrame = {
  value: number
  unit: 'hours' | 'days'
  label: string
}

export const createTimeFrameOptions = (t: (key: string) => string): TTimeFrame[] => [
  // Hours: 1-24
  ...Array.from({ length: 24 }, (_, i) => ({
    value: i + 1,
    unit: 'hours' as const,
    label: `${i + 1} ${t('GroupedNotesHours')}`
  })),
  // Days: 2-30
  ...Array.from({ length: 29 }, (_, i) => ({
    value: i + 2,
    unit: 'days' as const,
    label: `${i + 2} ${t('GroupedNotesDays')}`
  }))
]

export type TGroupedNotesSettings = {
  enabled: boolean
  timeFrame: TTimeFrame
  maxNotesFilter: number // 0 means disabled
  compactedView: boolean
}

export type TStoredTimeFrame = {
  value: number
  unit: 'hours' | 'days'
}

export type TStoredGroupedNotesSettings = {
  enabled: boolean
  timeFrame: TStoredTimeFrame
  maxNotesFilter: number
  compactedView: boolean
}

type TGroupedNotesContext = {
  settings: TGroupedNotesSettings
  updateSettings: (settings: Partial<TGroupedNotesSettings>) => void
  resetSettings: () => void
  timeFrameOptions: TTimeFrame[]
}

const createDefaultSettings = (timeFrameOptions: TTimeFrame[]): TGroupedNotesSettings => ({
  enabled: false,
  timeFrame: timeFrameOptions[23], // 24 hours
  maxNotesFilter: 0, // Disabled
  compactedView: false
})

const GroupedNotesContext = createContext<TGroupedNotesContext | undefined>(undefined)

export const useGroupedNotes = () => {
  const context = useContext(GroupedNotesContext)
  if (!context) {
    throw new Error('useGroupedNotes must be used within a GroupedNotesProvider')
  }
  return context
}

export function GroupedNotesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const timeFrameOptions = createTimeFrameOptions(t)

  const [settings, setSettings] = useState<TGroupedNotesSettings>(() => {
    const storedSettings = storage.getGroupedNotesSettings()
    if (storedSettings) {
      // Find matching timeFrame with current translations
      const timeFrame = timeFrameOptions.find(
        tf => tf.value === storedSettings.timeFrame.value && tf.unit === storedSettings.timeFrame.unit
      ) || timeFrameOptions[23] // fallback to 24 hours

      return {
        ...storedSettings,
        timeFrame // use the one with current translations
      }
    }
    return createDefaultSettings(timeFrameOptions)
  })

  const updateSettings = (newSettings: Partial<TGroupedNotesSettings>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    // Convert to storage format (without translated labels)
    const storageSettings: TStoredGroupedNotesSettings = {
      ...updated,
      timeFrame: {
        value: updated.timeFrame.value,
        unit: updated.timeFrame.unit
      }
    }
    storage.setGroupedNotesSettings(storageSettings)
  }

  const resetSettings = () => {
    const defaultSettings = createDefaultSettings(timeFrameOptions)
    setSettings(defaultSettings)

    // Convert to storage format and save
    const storageSettings: TStoredGroupedNotesSettings = {
      ...defaultSettings,
      timeFrame: {
        value: defaultSettings.timeFrame.value,
        unit: defaultSettings.timeFrame.unit
      }
    }
    storage.setGroupedNotesSettings(storageSettings)
  }

  return (
    <GroupedNotesContext.Provider value={{ settings, updateSettings, resetSettings, timeFrameOptions }}>
      {children}
    </GroupedNotesContext.Provider>
  )
}

export function getTimeFrameInMs(timeFrame: TTimeFrame): number {
  const multiplier = timeFrame.unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return timeFrame.value * multiplier
}