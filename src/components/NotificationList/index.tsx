import { ExtendedKind, NOTIFICATION_LIST_STYLE } from '@/constants'
import { getEmbeddedPubkeys, getParentETag } from '@/lib/event'
import { usePrimaryPage } from '@/PageManager'
import { binarySearch } from '@nostr/tools/utils'
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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PullToRefresh from 'react-simple-pull-to-refresh'
import Tabs from '../Tabs'
import { NotificationItem } from './NotificationItem'
import { NotificationSkeleton } from './NotificationItem/Notification'
import { batchDebounce, isTouchDevice } from '@/lib/utils'
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
  const [filteredNotifications, setFilteredNotifications] = useState<NostrEvent[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const filterGeneration = useRef(0)

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
      setFilteredNotifications(events)
      return
    }

    if (!pubkey) {
      setFilteredNotifications([])
      return
    }

    // Increment generation to cancel previous filtering operations
    filterGeneration.current += 1
    const currentGeneration = filterGeneration.current

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
      const filtered: (NostrEvent | Promise<NostrEvent | undefined>)[] = []

      for (const event of events) {
        // For text-based kinds, check if it's a mention
        if (textKinds.includes(event.kind)) {
          filtered.push(
            isMention(event).then((is) => {
              if (is) return event
            })
          )
        } else {
          // For reactions, reposts, zaps - always include in All tab
          if (notificationType === 'all') {
            filtered.push(event)
          }
        }
      }

      const results = (await Promise.all(filtered)).filter(
        (evt): evt is NonNullable<NostrEvent> => !!evt
      )

      // Only apply results if this is still the current generation
      if (currentGeneration === filterGeneration.current) {
        setFilteredNotifications(results)
      }
    }

    filterEvents()
  }, [events, notificationType, pubkey])

  useEffect(() => {
    ;(async () => {
      if (!pubkey || !filter) return

      const relays = await client.fetchRelayList(pubkey)

      setSubRequests([
        {
          source: 'relays',
          urls: relays.read,
          filter
        },
        {
          source: 'local',
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

  const handleNewEvent = batchDebounce((events: NostrEvent[]) => {
    events.sort((a, b) => b.created_at - a.created_at)
    noteStatsService.updateNoteStatsByEvents(events)

    setEvents((oldEvents) => {
      const updated: NostrEvent[] = []
      let prevIdx = 0

      for (let i = 0; i < events.length; i++) {
        const event = events[i]

        const [idx, found] = binarySearch(oldEvents, (b) => {
          if (event.id === b.id) return 0
          if (event.created_at === b.created_at) {
            // Stable tiebreaker when timestamps match
            return event.id < b.id ? -1 : 1
          }
          return b.created_at - event.created_at
        })
        if (found) continue

        updated.push(...oldEvents.slice(prevIdx, idx))
        updated.push(event)
        prevIdx = idx
      }

      if (updated.length > 0) {
        updated.push(...oldEvents.slice(prevIdx))
        return updated
      } else {
        return oldEvents
      }
    })
  }, 1800)

  useEffect(() => {
    if (!subRequests || !pubkey) return
    if (current !== 'notifications') return

    // Cancel any pending debounced events from previous subscription
    handleNewEvent.cancel()

    setLoading(true)
    setEvents([])
    setShowCount(SHOW_COUNT)
    setLastReadTime(getNotificationsSeenAt())

    const subc = client.subscribeTimeline(
      subRequests,
      { limit: LIMIT },
      {
        onEvents: (events, isFinal) => {
          if (events.length > 0) {
            // Deduplicate events by ID
            const seen = new Set<string>()
            const deduped = events.filter((e) => {
              if (seen.has(e.id)) return false
              seen.add(e.id)
              return true
            })
            setEvents(deduped)
          }

          if (isFinal) {
            setHasMore(events.length > 0)
            setLoading(false)
            noteStatsService.updateNoteStatsByEvents(events)
          }
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
  }, [pubkey, active, filter])

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
        if (filteredNotifications.length - showCount > LIMIT / 2) {
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
        setEvents((currentEvents) => {
          const existingIds = new Set(currentEvents.map((e) => e.id))
          const seenInBatch = new Set<string>()
          const newEvents = olderEvents.filter((event) => {
            // Skip own events
            if (event.pubkey === pubkey) return false
            // Skip if already in current events
            if (existingIds.has(event.id)) return false
            // Skip if duplicate within olderEvents batch
            if (seenInBatch.has(event.id)) return false
            seenInBatch.add(event.id)
            return true
          })
          return [...currentEvents, ...newEvents]
        })
      } else {
        setHasMore(false)
      }
    }
  }, [pubkey, subRequests, loading, showCount, filteredNotifications])

  const refresh = () => {
    topRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
    setTimeout(() => {
      setRefreshCount((count) => count + 1)
    }, 500)
  }

  const list = (
    <div className={notificationListStyle === NOTIFICATION_LIST_STYLE.COMPACT ? 'pt-2' : ''}>
      {filteredNotifications.slice(0, showCount).map((notification) => (
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
