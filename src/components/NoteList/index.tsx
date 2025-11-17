import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import { isMentioningMutedUsers, isReplyNoteEvent } from '@/lib/event'
import { batchDebounce, isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event, NostrEvent } from '@nostr/tools/wasm'
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
      onNotesLoaded?: (count: number, hasPosts: boolean, hasReplies: boolean) => void
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

      const subc = client.subscribeTimeline(
        subRequests,
        {
          kinds: showKinds,
          limit: LIMIT,
          ...(sinceTimestamp && isFilteredView ? { since: sinceTimestamp } : {})
        },
        {
          async onEvents(events, isFinal) {
            if (isFinal) {
              setLoading(false)
              setHasMore(events.length > 0)

              if (onNotesLoaded) {
                // notify parent about notes composition (notes vs replies)
                let hasPosts = false
                let hasReplies = false
                for (let i = 0; i < events.length; i++) {
                  if (isReplyNoteEvent(events[i])) {
                    hasReplies = true
                  } else {
                    hasPosts = true
                  }
                  if (hasReplies && hasPosts) break
                }
                onNotesLoaded(events.length, hasPosts, hasReplies)
              }
            }

            if (events.length > 0) {
              setEvents(events)
            }
          },
          onNew: batchDebounce((newEvents) => {
            // do everything inside this setter so we get the latest state (because react is incredibly retarded)
            setEvents((events) => {
              const pending: NostrEvent[] = []
              const appended: NostrEvent[] = []

              for (let i = 0; i < newEvents.length; i++) {
                const newEvent = newEvents[i]

                // TODO: figure out where exactly the viewport is: for now just assume it's at the top
                if (events.length < 7 || newEvent.created_at < events[6].created_at) {
                  // if there are very few events in the viewport or the new events would be inserted below, just append
                  appended.push(newEvent)
                } else if (pubkey && newEvent.pubkey === pubkey) {
                  // our own notes are also inserted regardless of any concern
                  appended.push(newEvent)
                } else {
                  // any other "new" notes that would be inserted above, make them be pending in the modal thingie
                  pending.push(newEvent)
                }
              }

              if (pending.length) {
                // sort these as they will not come in order (they will come from different author syncing processes)
                pending.sort((a, b) => b.created_at - a.created_at)
                // prepend them to the top
                setNewEvents((curr) => [...pending, ...curr])
              }

              // we have no idea of the order here, so just sort everything and eliminate duplicates
              if (appended.length) {
                const all = [...events, ...appended].sort((a, b) => b.created_at - a.created_at)
                return all.filter((evt, i) => i === 0 || evt.id !== all[i - 1].id)
              } else {
                return events
              }
            })
          }, 1800),
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
    }, [subRequests, refreshCount, showKinds])

    const loadMore = useCallback(async () => {
      if (showCount < events.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
        // preload more
        if (events.length - showCount > LIMIT / 2) {
          return
        }
      }

      setLoading(true)

      const moreEvents = await client.loadMoreTimeline(subRequests, {
        until: events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
        limit: LIMIT,
        ...(sinceTimestamp && isFilteredView ? { since: sinceTimestamp } : {})
      })

      if (moreEvents.length === 0) {
        setHasMore(false)
        return
      }

      setEvents((events) => [...events, ...moreEvents])
      setLoading(false)
    }, [showCount, subRequests, sinceTimestamp, isFilteredView])

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
        {events
          .filter((evt) => !shouldHideEvent(evt))
          .map((event) => (
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
