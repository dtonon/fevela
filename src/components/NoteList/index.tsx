import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import { isMentioningMutedUsers, isReplyNoteEvent } from '@/lib/event'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event } from '@nostr/tools/wasm'
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
import PinnedNoteCard from '../PinnedNoteCard'

const LIMIT = 200
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
      showRelayCloseReason = false,
      sinceTimestamp,
      onNotesLoaded,
      pinnedEventIds,
      filterFn
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      filterMutedNotes?: boolean
      hideReplies?: boolean
      showOnlyReplies?: boolean
      hideUntrustedNotes?: boolean
      showRelayCloseReason?: boolean
      sinceTimestamp?: number
      onNotesLoaded?: (
        hasNotes: boolean,
        hasReplies: boolean,
        notesCount: number,
        repliesCount: number
      ) => void
      pinnedEventIds?: string[]
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
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [hasMore, setHasMore] = useState<boolean>(false)
    const [loading, setLoading] = useState(true)
    const [refreshCount, setRefreshCount] = useState(0)
    const [showCount, setShowCount] = useState(SHOW_COUNT)
    const [isFilteredView, setIsFilteredView] = useState(!!sinceTimestamp)
    const supportTouch = useMemo(() => isTouchDevice(), [])
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const topRef = useRef<HTMLDivElement | null>(null)

    const shouldHideEvent = useCallback(
      (evt: Event) => {
        if (pinnedEventIds && pinnedEventIds.includes(evt.id)) return true
        if (isEventDeleted(evt)) return true
        if (hideReplies && isReplyNoteEvent(evt)) return true
        if (showOnlyReplies && !isReplyNoteEvent(evt)) return true
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
        filterFn
      ]
    )

    // notify parent about notes composition (notes vs replies)
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

      setLoading(true)
      setEvents([])
      setNewEvents([])
      setHasMore(true)

      if (showKinds.length === 0) {
        setLoading(false)
        setHasMore(false)
        return () => {}
      }

      console.log('...')

      const subc = client.subscribeTimeline(
        subRequests,
        {
          kinds: showKinds,
          limit: LIMIT,
          ...(sinceTimestamp && isFilteredView ? { since: sinceTimestamp } : {})
        },
        {
          async onEvents(events, isFinal) {
            events = events.filter((evt) => !shouldHideEvent(evt))

            if (isFinal) {
              setLoading(false)
              setHasMore(events.length > 0)
            }

            if (events.length > 0) {
              setEvents(events)
            }
          },
          onNew(event) {
            if (shouldHideEvent(event)) return

            if (pubkey && event.pubkey === pubkey) {
              // if the new event is from the current user, insert it directly into the feed
              setEvents((oldEvents) =>
                oldEvents.some((e) => e.id === event.id) ? oldEvents : [event, ...oldEvents]
              )
            } else {
              // otherwise, buffer it and show the New Notes button
              setNewEvents((oldEvents) => [event, ...oldEvents])
            }
          },
          onClose(url, reason) {
            if (!showRelayCloseReason) return
            // ignore reasons from @nostr/tools
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
          startLogin
        }
      )

      return () => subc.close()
    }, [subRequests, refreshCount, showKinds, shouldHideEvent])

    const loadMore = useCallback(async () => {
      if (showCount < events.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
        // preload more
        if (events.length - showCount > LIMIT / 2) {
          return
        }
      }

      setLoading(true)

      let moreEvents = await client.loadMoreTimeline(subRequests, {
        until: events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
        limit: LIMIT,
        ...(sinceTimestamp && isFilteredView ? { since: sinceTimestamp } : {})
      })

      if (moreEvents.length === 0) {
        setHasMore(false)
        return
      }

      moreEvents = moreEvents.filter((evt) => !shouldHideEvent(evt))

      setEvents((events) => [...events, ...moreEvents])
      setLoading(false)
    }, [showCount, events, subRequests, sinceTimestamp, isFilteredView, shouldHideEvent])

    useEffect(() => {
      if (!hasMore || loading || isFilteredView) return

      const observerInstance = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            loadMore()
          }
        },
        {
          root: null,
          rootMargin: '10px',
          threshold: 0.1
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
    }, [hasMore, loading, isFilteredView, loadMore])

    function mergeNewEvents() {
      setEvents((oldEvents) => [...newEvents, ...oldEvents])
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    const list = (
      <div className="min-h-screen">
        {(pinnedEventIds || []).map((id) => (
          <PinnedNoteCard key={id} eventId={id} className="w-full" />
        ))}
        {events.map((event) => (
          <NoteCard
            key={event.id}
            className="w-full"
            event={event}
            filterMutedNotes={filterMutedNotes}
          />
        ))}
        {/* Loading states */}
        {loading && !events.length ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
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
        ) : hasMore || loading ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : events.length && !hasMore ? (
          <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
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
        {newEvents.length > 0 && <NewNotesButton newEvents={newEvents} onClick={mergeNewEvents} />}
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
