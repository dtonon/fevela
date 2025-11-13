import { BIG_RELAY_URLS, ExtendedKind, NOTIFICATION_LIST_STYLE } from '@/constants'
import { compareEvents, getEmbeddedPubkeys } from '@/lib/event'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import dayjs from 'dayjs'
import { NostrEvent } from '@nostr/tools/wasm'
import { matchFilter } from '@nostr/tools/filter'
import * as kinds from '@nostr/tools/kinds'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import PullToRefresh from 'react-simple-pull-to-refresh'
import { NotificationItem } from '../NotificationList/NotificationItem'
import { NotificationSkeleton } from '../NotificationList/NotificationItem/Notification'
import { isTouchDevice } from '@/lib/utils'
import { RefreshButton } from '../RefreshButton'
import { Input } from '@/components/ui/input'
import { userIdToPubkey } from '@/lib/pubkey'

const LIMIT = 100
const SHOW_COUNT = 30

const ConversationList = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { current, display } = usePrimaryPage()
  const active = useMemo(() => current === 'conversations' && display, [current, display])
  const { pubkey } = useNostr()
  const { notificationListStyle } = useUserPreferences()
  const [refreshCount, setRefreshCount] = useState(0)
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<NostrEvent[]>([])
  const [conversations, setConversations] = useState<NostrEvent[]>([])
  const [filteredConversations, setFilteredConversations] = useState<NostrEvent[]>([])
  const [visibleConversations, setVisibleConversations] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [until, setUntil] = useState<number | undefined>(dayjs().unix())
  const [userFilter, setUserFilter] = useState('')
  const [matchingPubkeys, setMatchingPubkeys] = useState<Set<string> | null>(null)
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const filterKinds = useMemo(
    () => [
      kinds.ShortTextNote,
      ExtendedKind.COMMENT,
      ExtendedKind.VOICE_COMMENT,
      ExtendedKind.POLL
    ],
    []
  )

  // Filter events to show only conversations (not explicit mentions)
  useEffect(() => {
    if (!pubkey) {
      setConversations([])
      return
    }

    // Check if an event is an explicit mention in content
    const isMention = (event: NostrEvent): boolean => {
      // Only check for explicit mentions in content (e.g., nostr:npub... references)
      const embeddedPubkeys = getEmbeddedPubkeys(event)
      return embeddedPubkeys.includes(pubkey)
    }

    const filterEvents = () => {
      const filtered: NostrEvent[] = []

      for (const event of notifications) {
        const eventIsMention = isMention(event)
        if (!eventIsMention) {
          filtered.push(event)
        }
      }

      setConversations(filtered)
    }

    filterEvents()
  }, [notifications, pubkey])

  // Search for matching pubkeys when user filter changes
  useEffect(() => {
    if (!userFilter.trim()) {
      setMatchingPubkeys(null)
      return
    }

    const searchProfiles = async () => {
      try {
        const npubs = await client.searchNpubsFromLocal(userFilter, 1000)
        const pubkeys = npubs
          .map((npub) => {
            try {
              return userIdToPubkey(npub)
            } catch {
              return null
            }
          })
          .filter((pubkey): pubkey is string => pubkey !== null)
        setMatchingPubkeys(new Set(pubkeys))
      } catch (e) {
        console.error('Error searching profiles:', e)
        setMatchingPubkeys(new Set())
      }
    }

    searchProfiles()
  }, [userFilter])

  // Apply user filter (by author name or content)
  useEffect(() => {
    if (!userFilter.trim()) {
      setFilteredConversations(conversations)
      return
    }

    const filterLower = userFilter.toLowerCase()

    const filtered = conversations.filter((event) => {
      // Check if author matches
      if (matchingPubkeys && matchingPubkeys.has(event.pubkey)) {
        return true
      }

      // Check if content matches
      if (event.content && event.content.toLowerCase().includes(filterLower)) {
        return true
      }

      return false
    })

    setFilteredConversations(filtered)
  }, [conversations, userFilter, matchingPubkeys])

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => {
        if (loading) return
        setRefreshCount((count) => count + 1)
      }
    }),
    [loading]
  )

  const handleNewEvent = useCallback(
    (event: NostrEvent) => {
      if (event.pubkey === pubkey) return
      setNotifications((oldEvents) => {
        const index = oldEvents.findIndex((oldEvent) => compareEvents(oldEvent, event) <= 0)
        if (index !== -1 && oldEvents[index].id === event.id) {
          return oldEvents
        }

        noteStatsService.updateNoteStatsByEvents([event])
        if (index === -1) {
          return [...oldEvents, event]
        }
        return [...oldEvents.slice(0, index), event, ...oldEvents.slice(index)]
      })
    },
    [pubkey]
  )

  useEffect(() => {
    if (current !== 'conversations') return

    if (!pubkey) {
      setUntil(undefined)
      return
    }

    const init = async () => {
      setLoading(true)
      setNotifications([])
      setShowCount(SHOW_COUNT)
      const relayList = await client.fetchRelayList(pubkey)

      const { closer, timelineKey } = await client.subscribeTimeline(
        [
          {
            urls: relayList.read.length > 0 ? relayList.read.slice(0, 5) : BIG_RELAY_URLS,
            filter: {
              '#p': [pubkey],
              kinds: filterKinds,
              limit: LIMIT
            }
          }
        ],
        {
          onEvents: (events, eosed) => {
            if (events.length > 0) {
              setNotifications(events.filter((event) => event.pubkey !== pubkey))
            }
            if (eosed) {
              setLoading(false)
              setUntil(events.length > 0 ? events[events.length - 1].created_at - 1 : undefined)
              noteStatsService.updateNoteStatsByEvents(events)
            }
          },
          onNew: (event) => {
            handleNewEvent(event)
          }
        }
      )
      setTimelineKey(timelineKey)
      return closer
    }

    const promise = init()
    return () => {
      promise.then((closer) => closer?.())
    }
  }, [pubkey, refreshCount, filterKinds, current])

  useEffect(() => {
    if (!active || !pubkey) return

    const handler = (data: Event) => {
      const customEvent = data as CustomEvent<NostrEvent>
      const evt = customEvent.detail
      if (
        matchFilter(
          {
            kinds: filterKinds,
            '#p': [pubkey]
          },
          evt
        )
      ) {
        handleNewEvent(evt)
      }
    }

    client.addEventListener('newEvent', handler)
    return () => {
      client.removeEventListener('newEvent', handler)
    }
  }, [pubkey, active, filterKinds, handleNewEvent])

  useEffect(() => {
    setVisibleConversations(filteredConversations.slice(0, showCount))
  }, [filteredConversations, showCount])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 1
    }

    const loadMore = async () => {
      if (showCount < filteredConversations.length) {
        setShowCount((count) => count + SHOW_COUNT)
        // preload more
        if (filteredConversations.length - showCount > LIMIT / 2) {
          return
        }
      }

      if (!pubkey || !timelineKey || !until || loading) return
      setLoading(true)
      const newNotifications = await client.loadMoreTimeline(timelineKey, until, LIMIT)
      setLoading(false)
      if (newNotifications.length === 0) {
        setUntil(undefined)
        return
      }

      if (newNotifications.length > 0) {
        setNotifications((oldNotifications) => [
          ...oldNotifications,
          ...newNotifications.filter((event) => event.pubkey !== pubkey)
        ])
      }

      setUntil(newNotifications[newNotifications.length - 1].created_at - 1)
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore()
      }
    }, options)

    const currentBottomRef = bottomRef.current

    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }

    return () => {
      if (observerInstance && currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }
  }, [pubkey, timelineKey, until, loading, showCount, filteredConversations])

  const refresh = () => {
    topRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
    setTimeout(() => {
      setRefreshCount((count) => count + 1)
    }, 500)
  }

  const list = (
    <div className={notificationListStyle === NOTIFICATION_LIST_STYLE.COMPACT ? 'pt-2' : ''}>
      {visibleConversations.map((conversation) => (
        <NotificationItem key={conversation.id} notification={conversation} isNew={false} />
      ))}
      <div className="text-center text-sm text-muted-foreground">
        {until || loading ? (
          <div ref={bottomRef}>
            <NotificationSkeleton />
          </div>
        ) : (
          t('no more conversations')
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div className="sticky flex items-center justify-between top-12 bg-background z-30 px-4 py-2 w-full border-b gap-3">
        <div
          tabIndex={0}
          className="relative flex w-full items-center rounded-md border border-input px-3 py-1 text-base transition-colors md:text-sm [&:has(:focus-visible)]:ring-ring [&:has(:focus-visible)]:ring-1 [&:has(:focus-visible)]:outline-none bg-surface-background shadow-inner h-full border-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-search size-4 shrink-0 opacity-50"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>

          <Input
            type="text"
            placeholder={t('Filter by author or content...')}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            showClearButton={true}
            onClear={() => setUserFilter('')}
            className="flex-1 h-9 size-full shadow-none border-none bg-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        </div>
        {!supportTouch && <RefreshButton onClick={() => refresh()} />}
      </div>
      <div ref={topRef} className="scroll-mt-[calc(6rem+1px)]" />
      {supportTouch ? (
        <PullToRefresh
          onRefresh={async () => {
            refresh()
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }}
          pullingContent=""
        >
          {list}
        </PullToRefresh>
      ) : (
        list
      )}
    </div>
  )
})
ConversationList.displayName = 'ConversationList'
export default ConversationList
