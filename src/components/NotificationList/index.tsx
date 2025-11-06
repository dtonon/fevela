import { ExtendedKind, NOTIFICATION_LIST_STYLE } from '@/constants'
import { compareEvents } from '@/lib/event'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useNotification } from '@/providers/NotificationProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { TFeedSubRequest, TNotificationType } from '@/types'
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
  const [events, setEvents] = useState<NostrEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
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
      setEvents((oldEvents) => {
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
    if (!subRequests || !pubkey) return
    if (current !== 'notifications') return

    setLoading(true)
    setEvents([])
    setShowCount(SHOW_COUNT)
    setLastReadTime(getNotificationsSeenAt())

    const subc = client.subscribeTimeline(
      subRequests,
      { limit: LIMIT },
      {
        onEvents: (events) => {
          if (events.length > 0) {
            setEvents(events.filter((event) => event.pubkey !== pubkey))
            setHasMore(true)
          }

          setLoading(false)
          noteStatsService.updateNoteStatsByEvents(events)
        },
        onNew: handleNewEvent
      }
    )

    return () => subc.close()
  }, [pubkey, refreshCount, current, subRequests])

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
    if (!pubkey || !subRequests.length || loading || !hasMore) return

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
      if (showCount < events.length) {
        setShowCount((count) => count + SHOW_COUNT)
        // preload more?
        if (events.length - showCount > LIMIT / 2) {
          return
        }
      }

      setLoading(true)
      const olderEvents = await client.loadMoreTimeline(subRequests, {
        until: events.length > 0 ? events[events.length - 1].created_at - 1 : dayjs().unix(),
        limit: LIMIT
      })
      setLoading(false)

      if (olderEvents.length > 0) {
        setEvents((currentEvents) => [
          ...currentEvents,
          ...olderEvents.filter((event) => event.pubkey !== pubkey)
        ])
      } else {
        setHasMore(false)
      }
    }
  }, [pubkey, subRequests, loading, showCount, hasMore, events])

  const refresh = () => {
    topRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
    setTimeout(() => {
      setRefreshCount((count) => count + 1)
    }, 500)
  }

  const list = (
    <div className={notificationListStyle === NOTIFICATION_LIST_STYLE.COMPACT ? 'pt-2' : ''}>
      {events.slice(0, showCount).map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          isNew={notification.created_at > lastReadTime}
        />
      ))}
      <div className="text-center text-sm text-muted-foreground">
        {hasMore || loading ? (
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
