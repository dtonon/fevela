import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import { isMentioningMutedUsers, isReplyNoteEvent, isFirstLevelReply } from '@/lib/event'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useGroupedNotesProcessing } from '@/hooks/useGroupedNotes'
import { useGroupedNotesReadStatus } from '@/hooks/useGroupedNotesReadStatus'
import { getTimeFrameInMs } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import { Event } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
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
import NoteCard from '../NoteCard'
import CompactedEventCard from '../CompactedEventCard'
import GroupedNotesEmptyState from '../GroupedNotesEmptyState'

const GroupedNoteList = forwardRef(
  (
    {
      subRequests,
      showKinds,
      filterMutedNotes = true,
      showRelayCloseReason = false,
      onNotesLoaded,
      userFilter = '',
      filterFn
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      filterMutedNotes?: boolean
      showRelayCloseReason?: boolean
      onNotesLoaded?: (
        hasNotes: boolean,
        hasReplies: boolean,
        notesCount: number,
        repliesCount: number
      ) => void
      userFilter?: string
      filterFn?: (event: Event) => boolean
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { startLogin, pubkey } = useNostr()
    const { mutePubkeySet } = useMuteList()
    const { hideContentMentioningMutedUsers } = useContentPolicy()
    const { isEventDeleted } = useDeletedEvent()
    const { resetSettings, settings: groupedNotesSettings } = useGroupedNotes()
    const { markLastNoteRead, markAllNotesRead, getReadStatus, getUnreadCount, markAsUnread } =
      useGroupedNotesReadStatus()
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshCount, setRefreshCount] = useState(0)
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
    const [matchingPubkeys, setMatchingPubkeys] = useState<Set<string> | null>(null)
    const supportTouch = useMemo(() => isTouchDevice(), [])
    const topRef = useRef<HTMLDivElement | null>(null)

    const {
      processedEvents: groupedEvents,
      groupedNotesData,
      hasNoResults: groupedHasNoResults
    } = useGroupedNotesProcessing(events, showKinds)

    const shouldHideEvent = useCallback(
      (evt: Event) => {
        if (isEventDeleted(evt)) return true
        // Filter nested replies when showOnlyFirstLevelReplies is enabled
        if (
          groupedNotesSettings.includeReplies &&
          groupedNotesSettings.showOnlyFirstLevelReplies &&
          isReplyNoteEvent(evt) &&
          !isFirstLevelReply(evt)
        ) {
          return true
        }
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
      [mutePubkeySet, isEventDeleted, groupedNotesSettings, filterFn]
    )

    // update matching pubkeys when user filter changes
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
        } catch (error) {
          console.error('Error searching profiles:', error)
          setMatchingPubkeys(new Set())
        }
      }

      searchProfiles()
    }, [userFilter])

    // apply user filter
    const userFilteredEvents = useMemo(() => {
      if (!userFilter.trim() || matchingPubkeys === null) {
        return groupedEvents
      }

      return groupedEvents.filter((evt) => matchingPubkeys.has(evt.pubkey))
    }, [groupedEvents, userFilter, matchingPubkeys])

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

      if (showKinds.length === 0) {
        setLoading(false)
        return () => {}
      }

      const timeframeMs = getTimeFrameInMs(groupedNotesSettings.timeFrame)
      const groupedNotesSince = Math.floor((Date.now() - timeframeMs) / 1000)

      const subc = client.subscribeTimeline(
        subRequests,
        {
          kinds: showKinds,
          since: groupedNotesSince
        },
        {
          async onEvents(events, isFinal) {
            events = events.filter((evt) => !shouldHideEvent(evt))

            if (isFinal) {
              setLoading(false)
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
    }, [subRequests, refreshCount, showKinds, groupedNotesSettings])

    function mergeNewEvents() {
      setEvents((oldEvents) => [...newEvents, ...oldEvents])
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    // check for no results
    if (groupedHasNoResults) {
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
        {userFilteredEvents.map((event) => {
          const groupedData = groupedNotesData.get(event.id)
          const totalNotesCount = groupedData?.totalNotesInTimeframe
          const oldestTimestamp = groupedData?.oldestTimestamp
          const allNoteTimestamps = groupedData?.allNoteTimestamps || []

          // Use CompactedNoteCard if compacted view is on
          if (groupedNotesSettings.compactedView && totalNotesCount) {
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
                onMarkAsUnread={() => markAsUnread(event.pubkey)}
                isLastNoteRead={readStatus.isLastNoteRead}
                areAllNotesRead={readStatus.areAllNotesRead}
              />
            )
          }

          // Use regular NoteCard
          const unreadCount = totalNotesCount
            ? getUnreadCount(event.pubkey, allNoteTimestamps)
            : totalNotesCount
          const readStatus = totalNotesCount
            ? getReadStatus(event.pubkey, event.created_at)
            : { isLastNoteRead: false, areAllNotesRead: false }

          return (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={filterMutedNotes}
              groupedNotesTotalCount={unreadCount}
              groupedNotesOldestTimestamp={oldestTimestamp}
              onAllNotesRead={() =>
                unreadCount && markAllNotesRead(event.pubkey, event.created_at, unreadCount)
              }
              areAllNotesRead={readStatus.areAllNotesRead}
            />
          )
        })}
        {events.length ? (
          <div className="text-center text-sm text-muted-foreground mt-2">
            {t('end of grouped results')}
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
        {newEvents.length > 0 && <NewNotesButton newEvents={newEvents} onClick={mergeNewEvents} />}
      </div>
    )
  }
)
GroupedNoteList.displayName = 'GroupedNoteList'
export default GroupedNoteList

export type TGroupedNoteListRef = {
  scrollToTop: (behavior?: ScrollBehavior) => void
  refresh: () => void
}
