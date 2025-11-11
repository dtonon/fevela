import { BIG_RELAY_URLS, ExtendedKind, NOTIFICATION_LIST_STYLE } from '@/constants'
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
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<NostrEvent[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<NostrEvent[]>([])
  const [visibleNotifications, setVisibleNotifications] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [until, setUntil] = useState<number | undefined>(dayjs().unix())
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const filterKinds = useMemo(() => {
    switch (notificationType) {
      case 'mentions':
      case 'conversations':
        return [
          kinds.ShortTextNote,
          ExtendedKind.COMMENT,
          ExtendedKind.VOICE_COMMENT,
          ExtendedKind.POLL
        ]
      case 'reactions':
        return [kinds.Reaction, kinds.Repost, ExtendedKind.POLL_RESPONSE]
      case 'zaps':
        return [kinds.Zap]
      default:
        return [
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
  }, [notificationType])

  // Filter events for mentions and conversations tabs
  useEffect(() => {
    if (notificationType !== 'mentions' && notificationType !== 'conversations') {
      setFilteredNotifications(notifications)
      return
    }

    if (!pubkey) {
      setFilteredNotifications([])
      return
    }

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
        const eventIsMention = await isMention(event)

        if (notificationType === 'mentions') {
          if (eventIsMention) {
            filtered.push(event)
          }
        } else if (notificationType === 'conversations') {
          if (!eventIsMention) {
            filtered.push(event)
          }
        }
      }

      setFilteredNotifications(filtered)
    }

    filterEvents()
  }, [notifications, notificationType, pubkey])

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

    const init = async () => {
      setLoading(true)
      setNotifications([])
      setShowCount(SHOW_COUNT)
      setLastReadTime(getNotificationsSeenAt())
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
    setVisibleNotifications(filteredNotifications.slice(0, showCount))
  }, [filteredNotifications, showCount])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 1
    }

    const loadMore = async () => {
      if (showCount < filteredNotifications.length) {
        setShowCount((count) => count + SHOW_COUNT)
        // preload more
        if (filteredNotifications.length - showCount > LIMIT / 2) {
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
  }, [pubkey, timelineKey, until, loading, showCount, filteredNotifications])

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
          { value: 'zaps', label: 'Zaps' },
          { value: 'conversations', label: 'Conversations' }
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
