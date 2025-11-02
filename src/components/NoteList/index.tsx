import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import {
  getReplaceableCoordinateFromEvent,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent,
  isFirstLevelReply
} from '@/lib/event'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useGroupedNotesProcessing } from '@/hooks/useGroupedNotes'
import { useGroupedNotesReadStatus } from '@/hooks/useGroupedNotesReadStatus'
import { getTimeFrameInMs } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
import { userIdToPubkey } from '@/lib/pubkey'
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
import { toast } from 'sonner'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'
import CompactedEventCard from '../CompactedEventCard'
import GroupedNotesEmptyState from '../GroupedNotesEmptyState'
import PinnedNoteCard from '../PinnedNoteCard'

const LIMIT = 200
const ALGO_LIMIT = 500
const SHOW_COUNT = 10

const NoteList = forwardRef(
  (
    {
      subRequests,
      showKinds,
      filterMutedNotes = true,
      hideReplies = false,
      showOnlyReplies = false,
      hideUntrustedNotes = false,
      areAlgoRelays = false,
      showRelayCloseReason = false,
      groupedMode = false,
      sinceTimestamp,
      onNotesLoaded,
      pinnedEventIds = [],
      userFilter = '',
      filterFn
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      filterMutedNotes?: boolean
      hideReplies?: boolean
      showOnlyReplies?: boolean
      hideUntrustedNotes?: boolean
      areAlgoRelays?: boolean
      showRelayCloseReason?: boolean
      groupedMode?: boolean
      sinceTimestamp?: number
      onNotesLoaded?: (
        hasNotes: boolean,
        hasReplies: boolean,
        notesCount: number,
        repliesCount: number
      ) => void
      pinnedEventIds?: string[]
      userFilter?: string
      filterFn?: (event: Event) => boolean
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { startLogin, pubkey } = useNostr()
    const { isUserTrusted } = useUserTrust()
    const { mutePubkeySet } = useMuteList()
    const { hideContentMentioningMutedUsers } = useContentPolicy()
    const { isEventDeleted } = useDeletedEvent()
    const { resetSettings, settings: groupedNotesSettings } = useGroupedNotes()
    const { markLastNoteRead, markAllNotesRead, getReadStatus, getUnreadCount } =
      useGroupedNotesReadStatus()
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [hasMore, setHasMore] = useState<boolean>(true)
    const [loading, setLoading] = useState(true)
    const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
    const [refreshCount, setRefreshCount] = useState(0)
    const [showCount, setShowCount] = useState(SHOW_COUNT)
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
    const [groupedLoadingMore, setGroupedLoadingMore] = useState(false)
    const [isFilteredView, setIsFilteredView] = useState(!!sinceTimestamp)
    const [matchingPubkeys, setMatchingPubkeys] = useState<Set<string> | null>(null)
    const supportTouch = useMemo(() => isTouchDevice(), [])
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const topRef = useRef<HTMLDivElement | null>(null)

    // Process grouped notes
    const {
      processedEvents: groupedEvents,
      groupedNotesData,
      hasNoResults: groupedHasNoResults
    } = useGroupedNotesProcessing(events, showKinds)

    // Use either grouped or normal events
    const eventsToProcess = groupedMode ? groupedEvents : events

    const shouldHideEvent = useCallback(
      (evt: Event) => {
        if (pinnedEventIds.includes(evt.id)) return true
        if (isEventDeleted(evt)) return true
        if (hideReplies && isReplyNoteEvent(evt)) return true
        if (showOnlyReplies && !isReplyNoteEvent(evt)) return true
        // Filter nested replies when showOnlyFirstLevelReplies is enabled
        if (
          groupedNotesSettings.includeReplies &&
          groupedNotesSettings.showOnlyFirstLevelReplies &&
          isReplyNoteEvent(evt) &&
          !isFirstLevelReply(evt)
        ) {
          return true
        }
        if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return true
        if (filterMutedNotes && mutePubkeySet.has(evt.pubkey)) return true
        if (
          filterMutedNotes &&
          hideContentMentioningMutedUsers &&
          isMentioningMutedUsers(evt, mutePubkeySet)
        ) {
          return true
        }
        if (filterFn && !filterFn(evt)) {
          return true
        }

        return false
      },
      [
        hideReplies,
        showOnlyReplies,
        hideUntrustedNotes,
        mutePubkeySet,
        pinnedEventIds,
        isEventDeleted,
        groupedNotesSettings,
        filterFn
      ]
    )

    const filteredEvents = useMemo(() => {
      const idSet = new Set<string>()

      return eventsToProcess
        .slice(0, groupedMode ? eventsToProcess.length : showCount)
        .filter((evt) => {
          if (shouldHideEvent(evt)) return false

          const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
          if (idSet.has(id)) {
            return false
          }
          idSet.add(id)
          return true
        })
    }, [eventsToProcess, showCount, shouldHideEvent, groupedMode])

    // Update matching pubkeys when user filter changes (for grouped mode)
    useEffect(() => {
      if (!groupedMode || !userFilter.trim()) {
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
        } catch (error) {
          console.error('Error searching profiles:', error)
          setMatchingPubkeys(new Set())
        }
      }

      searchProfiles()
    }, [groupedMode, userFilter])

    // Apply user filter for grouped mode
    const userFilteredEvents = useMemo(() => {
      if (!groupedMode || !userFilter.trim() || matchingPubkeys === null) {
        return filteredEvents
      }

      return filteredEvents.filter((evt) => matchingPubkeys.has(evt.pubkey))
    }, [filteredEvents, groupedMode, userFilter, matchingPubkeys])

    const filteredNewEvents = useMemo(() => {
      const idSet = new Set<string>()

      return newEvents.filter((event: Event) => {
        if (shouldHideEvent(event)) return false

        const id = isReplaceableEvent(event.kind)
          ? getReplaceableCoordinateFromEvent(event)
          : event.id
        if (idSet.has(id)) {
          return false
        }
        idSet.add(id)
        return true
      })
    }, [newEvents, shouldHideEvent])

    // Notify parent about notes composition (notes vs replies)
    useEffect(() => {
      if (!onNotesLoaded || loading || events.length === 0) return

      const notesCount = events.filter((evt) => !isReplyNoteEvent(evt)).length
      const repliesCount = events.filter((evt) => isReplyNoteEvent(evt)).length
      const hasNotes = notesCount > 0
      const hasReplies = repliesCount > 0

      onNotesLoaded(hasNotes, hasReplies, notesCount, repliesCount)
    }, [events, loading, onNotesLoaded])

    const scrollToTop = (behavior: ScrollBehavior = 'instant') => {
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior, block: 'start' })
      }, 20)
    }

    const refresh = () => {
      scrollToTop()
      setTimeout(() => {
        setRefreshCount((count) => count + 1)
      }, 500)
    }

    useImperativeHandle(ref, () => ({ scrollToTop, refresh }), [])

    useEffect(() => {
      if (!subRequests.length) return

      async function init() {
        setLoading(true)
        setEvents([])
        setNewEvents([])
        setHasMore(true)

        if (showKinds.length === 0) {
          setLoading(false)
          setHasMore(false)
          return () => {}
        }

        // For grouped mode, use standard timeline subscription then load back in time
        let timeframeSince: number | undefined
        if (groupedMode && groupedNotesSettings.enabled) {
          const timeframeMs = getTimeFrameInMs(groupedNotesSettings.timeFrame)
          timeframeSince = Math.floor((Date.now() - timeframeMs) / 1000)
        }

        // Standard timeline subscription
        const limit = areAlgoRelays ? ALGO_LIMIT : groupedMode ? 500 : LIMIT

        const { closer, timelineKey } = await client.subscribeTimeline(
          subRequests.map(({ urls, filter }) => ({
            urls,
            filter: {
              kinds: showKinds,
              ...filter,
              ...(sinceTimestamp && isFilteredView ? { since: sinceTimestamp } : {}),
              limit
            }
          })),
          {
            onEvents: async (events, eosed) => {
              if (events.length > 0) {
                setEvents(events)
              }
              if (areAlgoRelays) {
                setHasMore(false)
              }
              if (eosed) {
                setLoading(false)
                setHasMore(events.length > 0)

                // For grouped mode, automatically load more until we reach timeframe boundary
                if (groupedMode && timeframeSince && events.length > 0) {
                  const oldestEvent = events[events.length - 1]
                  if (oldestEvent.created_at > timeframeSince) {
                    // Start loading more data back in time
                    loadMoreGroupedData(timelineKey, oldestEvent.created_at - 1, timeframeSince)
                  } else {
                    // We've reached the time boundary, no more loading needed
                    setHasMore(false)
                  }
                }
              }
            },
            onNew: (event) => {
              if (pubkey && event.pubkey === pubkey) {
                // If the new event is from the current user, insert it directly into the feed
                setEvents((oldEvents) =>
                  oldEvents.some((e) => e.id === event.id) ? oldEvents : [event, ...oldEvents]
                )
              } else {
                // Otherwise, buffer it and show the New Notes button
                setNewEvents((oldEvents) =>
                  [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
                )
              }
            },
            onClose: (url, reason) => {
              if (!showRelayCloseReason) return
              // ignore reasons from nostr-tools
              if (
                [
                  'closed by caller',
                  'relay connection errored',
                  'relay connection closed',
                  'pingpong timed out',
                  'relay connection closed by us'
                ].includes(reason)
              ) {
                return
              }

              toast.error(`${url}: ${reason}`)
            }
          },
          {
            startLogin,
            needSort: !areAlgoRelays
          }
        )
        setTimelineKey(timelineKey)

        // Function to load more data for grouped mode
        const loadMoreGroupedData = async (key: string, until: number, timeframeSince: number) => {
          setGroupedLoadingMore(true)
          try {
            const moreEvents = await client.loadMoreTimeline(key, until, limit)
            if (moreEvents.length === 0) {
              setHasMore(false)
              setGroupedLoadingMore(false)
              return
            }

            setEvents((prevEvents) => [...prevEvents, ...moreEvents])

            // Check if we need to load even more
            const oldestNewEvent = moreEvents[moreEvents.length - 1]
            if (oldestNewEvent.created_at > timeframeSince) {
              // Recursively load more until we reach the time boundary
              await loadMoreGroupedData(key, oldestNewEvent.created_at - 1, timeframeSince)
            } else {
              setHasMore(false)
              setGroupedLoadingMore(false)
            }
          } catch (error) {
            console.error('Error loading more grouped data:', error)
            setHasMore(false)
            setGroupedLoadingMore(false)
          }
        }

        return closer
      }

      const promise = init()
      return () => {
        promise.then((closer) => closer())
      }
    }, [
      JSON.stringify(subRequests),
      refreshCount,
      showKinds,
      groupedMode,
      JSON.stringify(groupedNotesSettings)
    ])

    useEffect(() => {
      const options = {
        root: null,
        rootMargin: '10px',
        threshold: 0.1
      }

      const loadMore = async () => {
        // Don't auto-load if we're in filtered view mode
        if (isFilteredView) return

        if (showCount < events.length) {
          setShowCount((prev) => prev + SHOW_COUNT)
          // preload more
          if (events.length - showCount > LIMIT / 2) {
            return
          }
        }

        if (!timelineKey || loading || !hasMore) return
        setLoading(true)
        const newEvents = await client.loadMoreTimeline(
          timelineKey,
          events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
          LIMIT
        )
        setLoading(false)
        if (newEvents.length === 0) {
          setHasMore(false)
          return
        }
        setEvents((oldEvents) => [...oldEvents, ...newEvents])
      }

      const observerInstance = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
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
    }, [loading, hasMore, events, showCount, timelineKey, isFilteredView])

    const showNewEvents = () => {
      setEvents((oldEvents) => [...newEvents, ...oldEvents])
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    // Removed unused groupedSettingsOpen state - settings are managed in GroupedNotesFilter

    // In grouped mode, check for no results
    if (groupedMode && groupedHasNoResults) {
      return (
        <div>
          <div ref={topRef} className="scroll-mt-[calc(6rem+1px)]" />
          <GroupedNotesEmptyState
            onOpenSettings={() => {
              // Settings will be handled by the GroupedNotesFilter component
            }}
            onReset={resetSettings}
          />
        </div>
      )
    }

    const list = (
      <div className="min-h-screen">
        {pinnedEventIds.map((id) => (
          <PinnedNoteCard key={id} eventId={id} className="w-full" />
        ))}
        {userFilteredEvents.map((event) => {
          const groupedData = groupedMode ? groupedNotesData.get(event.id) : undefined
          const totalNotesCount = groupedData?.totalNotesInTimeframe
          const oldestTimestamp = groupedData?.oldestTimestamp
          const allNoteTimestamps = groupedData?.allNoteTimestamps || []

          // Use CompactedNoteCard if grouped mode is enabled and compacted view is on
          if (groupedMode && groupedNotesSettings.compactedView && totalNotesCount) {
            const readStatus = getReadStatus(event.pubkey, event.created_at)
            const unreadCount = getUnreadCount(event.pubkey, allNoteTimestamps)

            return (
              <CompactedEventCard
                key={event.id}
                className="w-full"
                event={event}
                variant={event.kind === kinds.Repost ? 'repost' : 'note'}
                totalNotesInTimeframe={unreadCount}
                oldestTimestamp={oldestTimestamp}
                filterMutedNotes={filterMutedNotes}
                isSelected={selectedNoteId === event.id}
                onSelect={() => setSelectedNoteId(event.id)}
                onLastNoteRead={() => {
                  // If there's only one note, mark all as read instead of just last
                  if (totalNotesCount === 1) {
                    markAllNotesRead(event.pubkey, event.created_at, unreadCount)
                  } else {
                    markLastNoteRead(event.pubkey, event.created_at, unreadCount)
                  }
                }}
                onAllNotesRead={() => markAllNotesRead(event.pubkey, event.created_at, unreadCount)}
                isLastNoteRead={readStatus.isLastNoteRead}
                areAllNotesRead={readStatus.areAllNotesRead}
              />
            )
          }

          // Use regular NoteCard
          const unreadCountForNonCompact =
            groupedMode && totalNotesCount
              ? getUnreadCount(event.pubkey, allNoteTimestamps)
              : totalNotesCount
          const readStatusForNonCompact =
            groupedMode && totalNotesCount
              ? getReadStatus(event.pubkey, event.created_at)
              : { isLastNoteRead: false, areAllNotesRead: false }

          return (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={filterMutedNotes}
              groupedNotesTotalCount={unreadCountForNonCompact}
              groupedNotesOldestTimestamp={oldestTimestamp}
              onAllNotesRead={() =>
                unreadCountForNonCompact &&
                markAllNotesRead(event.pubkey, event.created_at, unreadCountForNonCompact)
              }
              areAllNotesRead={readStatusForNonCompact.areAllNotesRead}
            />
          )
        })}
        {/* Loading states */}
        {loading && !events.length ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : groupedMode && groupedLoadingMore ? (
          <div className="flex justify-center items-center gap-2 mt-4 p-4">
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="text-sm text-muted-foreground">{t('Loading more notes...')}</div>
          </div>
        ) : isFilteredView && events.length > 0 ? (
          <div className="flex justify-center items-center mt-4 p-4">
            <Button
              size="lg"
              onClick={async () => {
                setIsFilteredView(false)
                setHasMore(true)
              }}
            >
              {t('Load more notes')}
            </Button>
          </div>
        ) : !groupedMode && (hasMore || loading) ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : events.length && !hasMore ? (
          <div className="text-center text-sm text-muted-foreground mt-2">
            {groupedMode ? t('end of grouped results') : t('no more notes')}
          </div>
        ) : !loading && !events.length ? (
          <div className="flex justify-center w-full mt-2">
            <Button size="lg" onClick={() => setRefreshCount((count) => count + 1)}>
              {t('reload notes')}
            </Button>
          </div>
        ) : null}
      </div>
    )

    return (
      <div>
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
        <div className="h-40" />
        {filteredNewEvents.length > 0 && (
          <NewNotesButton newEvents={filteredNewEvents} onClick={showNewEvents} />
        )}
      </div>
    )
  }
)
NoteList.displayName = 'NoteList'
export default NoteList

export type TNoteListRef = {
  scrollToTop: (behavior?: ScrollBehavior) => void
  refresh: () => void
}
