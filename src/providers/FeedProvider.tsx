import { createContext, useContext, useEffect, useRef, useState } from 'react'

import { DEFAULT_FAVORITE_RELAYS } from '@/constants'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import storage from '@/services/local-storage.service'
import { TFeedInfo, TFeedType } from '@/types'
import { useFavoriteRelays } from './FavoriteRelaysProvider'
import { useNostr } from './NostrProvider'

type TFeedContext = {
  feedInfo: TFeedInfo
  relayUrls: string[]
  isReady: boolean
  switchFeed: (
    feedType: TFeedType,
    options?: { activeRelaySetId?: string; pubkey?: string; relay?: string | null }
  ) => Promise<void>

  settings: TFeedSettings
  updateSettings: (settings: Partial<TFeedSettings>) => void
  resetSettings: () => TFeedSettings
  timeFrameOptions: TTimeFrame[]
}

export type TFeedSettings = {
  grouped: boolean
  groupedTimeframe: TTimeFrame
  groupedCompactedView: boolean
  groupedShowPreview: boolean
  groupedSortByRelevance: boolean

  wordFilter: string[]
  maxNotesFilter: number // 0 means disabled
  includeReplies: boolean
  showOnlyFirstLevelReplies: boolean
  hideShortNotes: boolean
}

export type TTimeFrame = {
  value: number
  unit: 'hours' | 'days'
  label: string
}

export const createDefaultSettings = (timeFrameOptions?: TTimeFrame[]): TFeedSettings => ({
  grouped: true,
  groupedTimeframe: (timeFrameOptions || createTimeFrameOptions())[23], // 24 hours
  groupedCompactedView: true,
  groupedShowPreview: true,
  groupedSortByRelevance: false,
  wordFilter: [],
  maxNotesFilter: 0, // 0 = disabled
  includeReplies: false,
  showOnlyFirstLevelReplies: false,
  hideShortNotes: false
})

export const createTimeFrameOptions = (): TTimeFrame[] => [
  // Hours: 1-24
  ...Array.from({ length: 24 }, (_, i) => ({
    value: i + 1,
    unit: 'hours' as const,
    label: 'GroupedNotesHours'
  })),
  // Days: 2-30
  ...Array.from({ length: 29 }, (_, i) => ({
    value: i + 2,
    unit: 'days' as const,
    label: 'GroupedNotesDays'
  }))
]

export function getTimeFrameInMs(timeFrame: TTimeFrame): number {
  const multiplier = timeFrame.unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return timeFrame.value * multiplier
}

const FeedContext = createContext<TFeedContext | undefined>(undefined)

export const useFeed = () => {
  const context = useContext(FeedContext)
  if (!context) {
    throw new Error('useFeed must be used within a FeedProvider')
  }
  return context
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const { pubkey, isInitialized } = useNostr()
  const { relaySets, urls: relayURLs } = useFavoriteRelays()
  const [relayUrls, setRelayUrls] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)
  const [feedInfo, setFeedInfo] = useState<TFeedInfo>({
    feedType: 'relay',
    id: DEFAULT_FAVORITE_RELAYS[0]
  })
  const feedInfoRef = useRef<TFeedInfo>(feedInfo)
  const timeFrameOptions = createTimeFrameOptions()

  useEffect(() => {
    const init = async () => {
      if (!isInitialized) {
        return
      }

      let feedInfo: TFeedInfo = pubkey
        ? { feedType: 'following' }
        : {
            feedType: 'relay',
            id: relayURLs[0] ?? DEFAULT_FAVORITE_RELAYS[0]
          }

      if (pubkey) {
        const storedFeedInfo = storage.getFeedInfo(pubkey)
        if (storedFeedInfo) {
          feedInfo = storedFeedInfo
        }
      }

      if (feedInfo.feedType === 'relays') {
        return await switchFeed('relays', { activeRelaySetId: feedInfo.id })
      }

      if (feedInfo.feedType === 'relay') {
        return await switchFeed('relay', { relay: feedInfo.id })
      }

      // update following feed if pubkey changes
      if (feedInfo.feedType === 'following' && pubkey) {
        return await switchFeed('following', { pubkey })
      }
    }

    init()
  }, [pubkey, isInitialized])

  const [settings, setSettings] = useState<TFeedSettings>(() => {
    const storedSettings = storage.getFeedSettings()
    if (storedSettings) {
      // find matching timeFrame with current translations
      const groupedTimeframe =
        timeFrameOptions.find(
          (tf) =>
            tf.value === storedSettings.groupedTimeframe?.value &&
            tf.unit === storedSettings.groupedTimeframe?.unit
        ) || timeFrameOptions[23] // fallback to 24 hours

      return {
        ...storedSettings,
        groupedTimeframe, // use the one with current translations
        groupedShowPreview: storedSettings.groupedShowPreview ?? true, // default to true for existing users
        groupedSortByRelevance: storedSettings.groupedSortByRelevance ?? false, // default to false for existing users
        wordFilter: storedSettings.wordFilter ?? '', // default to empty for existing users
        showOnlyFirstLevelReplies: storedSettings.showOnlyFirstLevelReplies ?? false, // default to false for existing users
        hideShortNotes: storedSettings.hideShortNotes ?? false // default to false for existing users
      }
    }
    return createDefaultSettings(timeFrameOptions)
  })

  return (
    <FeedContext.Provider
      value={{
        feedInfo,
        relayUrls,
        isReady,
        switchFeed,
        settings,
        updateSettings,
        resetSettings,
        timeFrameOptions
      }}
    >
      {children}
    </FeedContext.Provider>
  )

  async function switchFeed(
    feedType: TFeedType,
    options: {
      activeRelaySetId?: string | null
      pubkey?: string | null
      relay?: string | null
    } = {}
  ) {
    setIsReady(false)

    if (feedType === 'relay') {
      const normalizedUrl = normalizeUrl(options.relay ?? '')
      if (!normalizedUrl || !isWebsocketUrl(normalizedUrl)) {
        setIsReady(true)
        return
      }

      const newFeedInfo = { feedType, id: normalizedUrl }
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      setRelayUrls([normalizedUrl])
      storage.setFeedInfo(newFeedInfo, pubkey)
      storage.setLastRelay(normalizedUrl, pubkey)
      setIsReady(true)
      return
    }

    if (feedType === 'relays') {
      const relaySetId = options.activeRelaySetId ?? (relaySets.length > 0 ? relaySets[0].id : null)
      if (!relaySetId || !pubkey) {
        setIsReady(true)
        return
      }

      const relaySet =
        relaySets.find((set) => set.id === relaySetId) ??
        (relaySets.length > 0 ? relaySets[0] : null)
      // TODO: here before there was some weird piece of code that reloaded the set from indexeddb
      // I don't think that makes any difference, we'll see
      if (relaySet) {
        const newFeedInfo = { feedType, id: relaySet.id }
        setFeedInfo(newFeedInfo)
        feedInfoRef.current = newFeedInfo
        setRelayUrls(relaySet.relayUrls)
        storage.setFeedInfo(newFeedInfo, pubkey)
        setIsReady(true)
      }
      setIsReady(true)
      return
    }

    if (feedType === 'following') {
      if (!options.pubkey) {
        setIsReady(true)
        return
      }
      const newFeedInfo = { feedType }
      setFeedInfo(newFeedInfo)
      feedInfoRef.current = newFeedInfo
      storage.setFeedInfo(newFeedInfo, pubkey)

      setRelayUrls([])
      setIsReady(true)
      return
    }
    setIsReady(true)
  }

  function updateSettings(newSettings: Partial<TFeedSettings>) {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    storage.setFeedSettings(updated)
  }

  function resetSettings(): TFeedSettings {
    const defaultSettings = createDefaultSettings(timeFrameOptions)
    setSettings(defaultSettings)
    storage.setFeedSettings(defaultSettings)
    return defaultSettings
  }
}
