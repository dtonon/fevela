import { ExtendedKind, NOTIFICATION_LIST_STYLE } from '@/constants'
import { compareEvents, getEmbeddedPubkeys, getParentETag } from '@/lib/event'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useNotification } from '@/providers/NotificationProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { TNotificationType } from '@/types'
import dayjs from 'dayjs'
import { NostrEvent } from '@nostr/tools/wasm'
import { Filter, matchFilter } from '@nostr/tools/filter'
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
import Tabs from '../Tabs'
import { NotificationItem } from './NotificationItem'
import { NotificationSkeleton } from './NotificationItem/Notification'
import { isTouchDevice } from '@/lib/utils'
import { RefreshButton } from '../RefreshButton'

const LIMIT = 100
const SHOW_COUNT = 30

const NotificationList = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { current, display } = usePrimaryPage()
  const active = useMemo(() => current === 'notifications' && display, [current, display])
  const { pubkey } = useNostr()
  const { getNotificationsSeenAt } = useNotification()
  const { notificationListStyle } = useUserPreferences()
  const [notificationType, setNotificationType] = useState<TNotificationType>('all')
  const [lastReadTime, setLastReadTime] = useState(0)
  const [refreshCount, setRefreshCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<NostrEvent[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<NostrEvent[]>([])
  const [visibleNotifications, setVisibleNotifications] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [subRequests, setSubRequests] = useState<Parameters<typeof client.subscribeTimeline>[0]>([])
  const [until, setUntil] = useState<number | undefined>(dayjs().unix())
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const filter = useMemo<Omit<Filter, 'since' | 'until'> | undefined>(() => {
    if (!pubkey) return

    let filterKinds: number[] = []
    switch (notificationType) {
      case 'mentions':
        filterKinds = [
          kinds.ShortTextNote,
          ExtendedKind.COMMENT,
          ExtendedKind.VOICE_COMMENT,
          ExtendedKind.POLL
        ]
        break
      case 'reactions':
        filterKinds = [kinds.Reaction, kinds.Repost, ExtendedKind.POLL_RESPONSE]
        break
      case 'zaps':
        filterKinds = [kinds.Zap]
        break
      default:
        filterKinds = [
          kinds.ShortTextNote,
          kinds.Repost,
          kinds.Reaction,
          kinds.Zap,
          ExtendedKind.COMMENT,
          ExtendedKind.POLL_RESPONSE,
          ExtendedKind.VOICE_COMMENT,
          ExtendedKind.POLL
        ]
    }

    return {
      '#p': [pubkey],
      kinds: filterKinds
    }
  }, [pubkey, notificationType])

  // Filter events for mentions and all tabs
  useEffect(() => {
    // Reactions and Zaps tabs don't need filtering
    if (notificationType !== 'mentions' && notificationType !== 'all') {
      setFilteredNotifications(notifications)
      return
    }

    if (!pubkey) {
      setFilteredNotifications([])
      return
    }

    // Text-based kinds that need mention filtering
    const textKinds = [
      kinds.ShortTextNote,
      ExtendedKind.COMMENT,
      ExtendedKind.VOICE_COMMENT,
      ExtendedKind.POLL
    ]

    // Check if an event is a mention (explicit mention or direct reply)
    const isMention = async (event: NostrEvent): Promise<boolean> => {
      // Check explicit mentions in content
      const embeddedPubkeys = getEmbeddedPubkeys(event)
      if (embeddedPubkeys.includes(pubkey)) {
        return true
      }

      // Check if this is a direct reply to user's note
      const parentETag = getParentETag(event)
      if (parentETag) {
        // Try to get author from e-tag hint (5th element)
        const parentAuthorFromTag = parentETag[4]
        if (parentAuthorFromTag === pubkey) {
          return true
        }

        // If no hint or hint doesn't match, fetch the parent event
        if (!parentAuthorFromTag) {
          try {
            const parentEventHexId = parentETag[1]
            const parentEvent = await client.fetchEvent(parentEventHexId)
            if (parentEvent && parentEvent.pubkey === pubkey) {
              return true
            }
          } catch (e) {
            console.debug('Could not fetch parent event for filtering:', e)
          }
        }
      }

      return false
    }

    const filterEvents = async () => {
      const filtered: NostrEvent[] = []

      for (const event of notifications) {
        // For text-based kinds, check if it's a mention
        if (textKinds.includes(event.kind)) {
          const eventIsMention = await isMention(event)
          if (eventIsMention) {
            filtered.push(event)
          }
        } else {
          // For reactions, reposts, zaps - always include in All tab
          if (notificationType === 'all') {
            filtered.push(event)
          }
        }
      }

      setFilteredNotifications(filtered)
    }

    filterEvents()
  }, [notifications, notificationType, pubkey])

  useEffect(() => {
    ;(async () => {
      if (!pubkey || !filter) return
      const relays = await client.fetchRelayList(pubkey)

      setSubRequests([
        {
          source: 'relays',
          urls: relays.read,
          filter
        }
      ])
    })()
  }, [pubkey, filter])

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
    if (current !== 'notifications') return

    if (!pubkey) {
      setUntil(undefined)
      return
    }

    setLoading(true)
    setNotifications([])
    setShowCount(SHOW_COUNT)
    setLastReadTime(getNotificationsSeenAt())

    const subc = client.subscribeTimeline(
      subRequests,
      { limit: LIMIT },
      {
        onEvents: (events) => {
          if (events.length > 0) {
            setNotifications(events.filter((event) => event.pubkey !== pubkey))
          }

          setLoading(false)
          setUntil(events.length > 0 ? events[events.length - 1].created_at - 1 : undefined)
          noteStatsService.updateNoteStatsByEvents(events)
        },
        onNew: handleNewEvent
      }
    )

    return () => subc.close()
  }, [pubkey, refreshCount, filter, current])

  useEffect(() => {
    if (!active || !pubkey || !filter) return

    function handler(data: Event) {
      const customEvent = data as CustomEvent<NostrEvent>
      const evt = customEvent.detail
      if (matchFilter(filter!, evt)) {
        handleNewEvent(evt)
      }
    }

    client.addEventListener('newEvent', handler)
    return () => {
      client.removeEventListener('newEvent', handler)
    }
  }, [pubkey, active, filter, handleNewEvent])

  useEffect(() => {
    setVisibleNotifications(filteredNotifications.slice(0, showCount))
  }, [filteredNotifications, showCount])

  useEffect(() => {
    if (!pubkey || !subRequests.length || loading || !until) return

    const observerInstance = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      {
        root: null,
        rootMargin: '10px',
        threshold: 1
      }
    )

    const currentBottomRef = bottomRef.current

    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }

    return () => {
      if (observerInstance && currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }

    async function loadMore() {
      if (showCount < notifications.length) {
        setShowCount((count) => count + SHOW_COUNT)
        // preload more
        if (filteredNotifications.length - showCount > LIMIT / 2) {
          return
        }
      }

      setLoading(true)
      const olderNotifications = await client.loadMoreTimeline(subRequests, { until, limit: LIMIT })
      setLoading(false)

      if (olderNotifications.length > 0) {
        setNotifications((oldNotifications) => [
          ...oldNotifications,
          ...olderNotifications.filter((event) => event.pubkey !== pubkey)
        ])
        setUntil(olderNotifications[olderNotifications.length - 1].created_at - 1)
      } else {
        setUntil(undefined)
        return
      }
    }
  }, [pubkey, subRequests, until, loading, showCount, filteredNotifications])

  const refresh = () => {
    topRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
    setTimeout(() => {
      setRefreshCount((count) => count + 1)
    }, 500)
  }

  const list = (
    <div className={notificationListStyle === NOTIFICATION_LIST_STYLE.COMPACT ? 'pt-2' : ''}>
      {visibleNotifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          isNew={notification.created_at > lastReadTime}
        />
      ))}
      <div className="text-center text-sm text-muted-foreground">
        {until || loading ? (
          <div ref={bottomRef}>
            <NotificationSkeleton />
          </div>
        ) : (
          t('no more notifications')
        )}
      </div>
    </div>
  )

  return (
    <div>
      <Tabs
        value={notificationType}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'mentions', label: 'Mentions' },
          { value: 'reactions', label: 'Reactions' },
          { value: 'zaps', label: 'Zaps' }
        ]}
        onTabChange={(type) => {
          setShowCount(SHOW_COUNT)
          setNotificationType(type as TNotificationType)
        }}
        options={!supportTouch ? <RefreshButton onClick={() => refresh()} /> : null}
      />
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

NotificationList.displayName = 'NotificationList'

export default NotificationList
