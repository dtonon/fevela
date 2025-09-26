import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import {
  getReplaceableCoordinateFromEvent,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent
} from '@/lib/event'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useGroupedNotesProcessing } from '@/hooks/useGroupedNotes'
import { getTimeFrameInMs } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
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
import CompactedNoteCard from '../CompactedNoteCard'
import CompactedRepostCard from '../CompactedRepostCard'
import GroupedNotesEmptyState from '../GroupedNotesEmptyState'

const LIMIT = 200
const ALGO_LIMIT = 500
const GROUPED_LIMIT = 1000
const SHOW_COUNT = 10

const NoteList = forwardRef(
  (
    {
      subRequests,
      showKinds,
      filterMutedNotes = true,
      hideReplies = false,
      hideUntrustedNotes = false,
      areAlgoRelays = false,
      showRelayCloseReason = false,
      groupedMode = false
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      filterMutedNotes?: boolean
      hideReplies?: boolean
      hideUntrustedNotes?: boolean
      areAlgoRelays?: boolean
      showRelayCloseReason?: boolean
      groupedMode?: boolean
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
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [hasMore, setHasMore] = useState<boolean>(true)
    const [loading, setLoading] = useState(true)
    const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
    const [refreshCount, setRefreshCount] = useState(0)
    const [showCount, setShowCount] = useState(SHOW_COUNT)
    const [groupedLoadingProgress, setGroupedLoadingProgress] = useState<{ current: number; total: number } | null>(null)
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
        if (isEventDeleted(evt)) return true
        if (hideReplies && isReplyNoteEvent(evt)) return true
        if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return true
        if (filterMutedNotes && mutePubkeySet.has(evt.pubkey)) return true
        if (
          filterMutedNotes &&
          hideContentMentioningMutedUsers &&
          isMentioningMutedUsers(evt, mutePubkeySet)
        ) {
          return true
        }

        return false
      },
      [hideReplies, hideUntrustedNotes, mutePubkeySet, isEventDeleted]
    )

    const filteredEvents = useMemo(() => {
      const idSet = new Set<string>()

      return eventsToProcess.slice(0, groupedMode ? eventsToProcess.length : showCount).filter((evt) => {
        if (shouldHideEvent(evt)) return false

        const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
        if (idSet.has(id)) {
          return false
        }
        idSet.add(id)
        return true
      })
    }, [eventsToProcess, showCount, shouldHideEvent, groupedMode])

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

        // Use chunked loading for grouped mode to get complete historical data
        if (groupedMode && groupedNotesSettings.enabled) {
          const timeframeMs = getTimeFrameInMs(groupedNotesSettings.timeFrame)
          const timeframeSince = Math.floor((Date.now() - timeframeMs) / 1000)

          setGroupedLoadingProgress({ current: 0, total: 1 })

          const requestsForChunkedLoading = subRequests.map(({ urls, filter }) => ({
            urls,
            filter: {
              kinds: showKinds,
              ...filter,
              // Don't set limit or since/until - chunked loader will handle this
            }
          }))

          client.loadGroupedTimeframe(
            requestsForChunkedLoading,
            timeframeSince,
            {
              onEvents: (events) => {
                setEvents(events)
                if (events.length > 0) {
                  setLoading(false)
                }
              },
              onProgress: (current, total) => {
                setGroupedLoadingProgress({ current, total })
              },
              onComplete: () => {
                setGroupedLoadingProgress(null)
                setLoading(false)
                setHasMore(false) // No "load more" for grouped mode
              }
            },
            {
              startLogin,
              chunkSizeHours: 6, // 6-hour chunks
              maxEventsPerChunk: 500 // Respect relay limits
            }
          )

          // For grouped mode, we don't use the traditional timeline subscription
          // but we still need a cleanup function
          return () => {
            setGroupedLoadingProgress(null)
          }
        }

        // Standard timeline subscription for non-grouped mode
        const groupedLimit = areAlgoRelays ? ALGO_LIMIT : LIMIT

        const { closer, timelineKey } = await client.subscribeTimeline(
          subRequests.map(({ urls, filter }) => ({
            urls,
            filter: {
              kinds: showKinds,
              ...filter,
              limit: groupedLimit
            }
          })),
          {
            onEvents: (events, eosed) => {
              if (events.length > 0) {
                setEvents(events)
              }
              if (areAlgoRelays) {
                setHasMore(false)
              }
              if (eosed) {
                setLoading(false)
                setHasMore(events.length > 0)
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
        return closer
      }

      const promise = init()
      return () => {
        promise.then((closer) => closer())
      }
    }, [JSON.stringify(subRequests), refreshCount, showKinds, groupedMode, JSON.stringify(groupedNotesSettings)])

    useEffect(() => {
      const options = {
        root: null,
        rootMargin: '10px',
        threshold: 0.1
      }

      const loadMore = async () => {
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
    }, [loading, hasMore, events, showCount, timelineKey])

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
        {filteredEvents.map((event) => {
          const totalNotesCount = groupedMode ? groupedNotesData.get(event.id)?.totalNotesInTimeframe : undefined

          // Use CompactedNoteCard if grouped mode is enabled and compacted view is on
          if (groupedMode && groupedNotesSettings.compactedView && totalNotesCount) {
            // Use CompactedRepostCard for repost events to maintain compacted layout
            if (event.kind === kinds.Repost) {
              return (
                <CompactedRepostCard
                  key={`compact-repost-${event.id}`}
                  className="w-full"
                  event={event}
                  totalNotesInTimeframe={totalNotesCount}
                  filterMutedNotes={filterMutedNotes}
                />
              )
            }
            return (
              <CompactedNoteCard
                key={event.id}
                className="w-full"
                event={event}
                totalNotesInTimeframe={totalNotesCount}
              />
            )
          }

          // Use regular NoteCard
          return (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={filterMutedNotes}
              groupedNotesTotalCount={totalNotesCount}
            />
          )
        })}
        {!groupedMode && (hasMore || loading) ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : events.length ? (
          <div className="text-center text-sm text-muted-foreground mt-2">
            {groupedMode ? t('end of grouped results') : t('no more notes')}
          </div>
        ) : (
          <div className="flex justify-center w-full mt-2">
            <Button size="lg" onClick={() => setRefreshCount((count) => count + 1)}>
              {t('reload notes')}
            </Button>
          </div>
        )}
        {groupedLoadingProgress && (
          <div className="flex flex-col items-center gap-2 mt-4 p-4 bg-muted/30 rounded-lg mx-4">
            <div className="text-sm text-muted-foreground">
              {t('Loading historical data...')} ({groupedLoadingProgress.current}/{groupedLoadingProgress.total})
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(groupedLoadingProgress.current / groupedLoadingProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    )

    return (
      <div>
        {filteredNewEvents.length > 0 && (
          <NewNotesButton newEvents={filteredNewEvents} onClick={showNewEvents} />
        )}
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
