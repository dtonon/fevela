import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import { isMentioningMutedUsers, isReplyNoteEvent, isFirstLevelReply } from '@/lib/event'
import { batchDebounce, isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useGroupedNotesReadStatus } from '@/hooks/useGroupedNotesReadStatus'
import { getTimeFrameInMs } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import { Event, NostrEvent } from '@nostr/tools/wasm'
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
import { toast } from 'sonner'
import NoteCard from '../NoteCard'
import CompactedEventCard from '../CompactedEventCard'
import GroupedNotesEmptyState from '../GroupedNotesEmptyState'
import { usePinBury } from '@/providers/PinBuryProvider'

type TNoteGroup = {
  topNote: NostrEvent
  totalNotes: number
  oldestTimestamp: number
  newestTimestamp: number
  allNoteTimestamps: number[]
}

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
    const { resetSettings, settings } = useGroupedNotes()
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
    const { getPinBuryState } = usePinBury()

    const [{ noteGroups, hasNoResults }, setNoteGroups] = useState<{
      noteGroups: TNoteGroup[]
      hasNoResults: boolean
    }>({
      noteGroups: [],
      hasNoResults: false
    })

    useEffect(() => {
      let filteredEvents = events

      if (!settings.includeReplies) {
        filteredEvents = filteredEvents.filter((event) => !isReplyNoteEvent(event))
      }

      // filter by word filter (content and hashtags)
      if (settings.wordFilter.trim()) {
        const filterWords = settings.wordFilter
          .split(',')
          .map((word) => word.trim().toLowerCase())
          .filter((word) => word.length > 0)

        if (filterWords.length > 0) {
          filteredEvents = filteredEvents.filter((event) => {
            // get content in lowercase for case-insensitive matching
            const content = (event.content || '').toLowerCase()

            // get hashtags from tags
            const hashtags = event.tags
              .filter((tag) => tag[0] === 't' && tag[1])
              .map((tag) => tag[1].toLowerCase())

            // check if any filter word matches content or hashtags
            const hasMatchInContent = filterWords.some((word) => content.includes(word))
            const hasMatchInHashtags = filterWords.some((word) =>
              hashtags.some((hashtag) => hashtag.includes(word))
            )

            // return true to KEEP the event (filter OUT filteredEvents that match)
            return !hasMatchInContent && !hasMatchInHashtags
          })
        }
      }

      // filter out short notes (single words or less than 10 characters)
      if (settings.hideShortNotes) {
        filteredEvents = filteredEvents.filter((event) => {
          const content = (event.content || '').trim()

          // filter out if content is less than 10 characters
          if (content.length < 10) {
            return false
          }

          // filter out emoji-only notes
          // remove emojis and check if there's any substantial text left
          // using Unicode property escapes to match all emoji characters
          const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
          const contentWithoutEmojis = content.replace(emojiRegex, '').replace(/\s+/g, '').trim()
          if (contentWithoutEmojis.length < 2) {
            return false
          }

          // filter out single words (no spaces or only one word)
          const words = content.split(/\s+/).filter((word) => word.length > 0)
          if (words.length === 1) {
            return false
          }

          return true
        })
      }

      // group events by author pubkey
      let noteGroups: TNoteGroup[] = []
      const authorIndexes = new Map<string, number>()

      for (let i = 0; i < filteredEvents.length; i++) {
        const event = filteredEvents[i]

        const idx = authorIndexes.get(event.pubkey)
        if (idx !== undefined) {
          const group = noteGroups[idx]
          group.allNoteTimestamps.push(event.created_at)
          group.oldestTimestamp = event.created_at
          group.totalNotes++
        } else {
          authorIndexes.set(event.pubkey, noteGroups.length)
          noteGroups.push({
            allNoteTimestamps: [event.created_at],
            newestTimestamp: event.created_at,
            oldestTimestamp: event.created_at,
            topNote: event,
            totalNotes: 1
          })
        }
      }

      // apply activity level filter
      if (settings.maxNotesFilter > 0) {
        for (let i = noteGroups.length - 1; i >= 0; i--) {
          const group = noteGroups[i]
          if (group.totalNotes > settings.maxNotesFilter) {
            noteGroups.splice(i, 1)
          }
        }
      }

      // sort final notes by pin/bury state (everything is already sorted by created_at descending)
      const pinned: TNoteGroup[] = []
      const buried: TNoteGroup[] = []
      for (let i = noteGroups.length - 1; i >= 0; i--) {
        const group = noteGroups[i]
        switch (getPinBuryState(group.topNote.pubkey)) {
          case 'pinned':
            pinned.push(group)
            noteGroups.splice(i, 1)
            break
          case 'buried':
            buried.push(group)
            noteGroups.splice(i, 1)
            break
        }
      }
      noteGroups = [...pinned.reverse(), ...noteGroups, ...buried.reverse()]

      setNoteGroups({
        noteGroups,
        hasNoResults: filteredEvents.length === 0 && events.length > 0
      })
    }, [events, settings, getPinBuryState])

    const shouldHideEvent = useCallback(
      (evt: Event) => {
        if (isEventDeleted(evt)) return true
        // Filter nested replies when showOnlyFirstLevelReplies is enabled
        if (
          settings.includeReplies &&
          settings.showOnlyFirstLevelReplies &&
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
      [mutePubkeySet, isEventDeleted, settings, filterFn]
    )

    // update matching pubkeys when user filter changes
    useEffect(() => {
      if (!userFilter.trim()) {
        setMatchingPubkeys(null)
        return
      }

      const searchProfiles = async () => {
        try {
          const pubkeys = await client.searchPubKeysFromLocal(userFilter, 1000)
          setMatchingPubkeys(new Set(pubkeys))
        } catch (error) {
          console.error('Error searching profiles:', error)
          setMatchingPubkeys(new Set())
        }
      }

      searchProfiles()
    }, [userFilter])

    // apply author name filter
    const nameFilteredGroups = useMemo(() => {
      if (!userFilter.trim() || matchingPubkeys === null) {
        return noteGroups
      }

      return noteGroups.filter((group) => matchingPubkeys.has(group.topNote.pubkey))
    }, [noteGroups, userFilter, matchingPubkeys])

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

      const timeframeMs = getTimeFrameInMs(settings.timeFrame)
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
          onNew: batchDebounce(
            (newEvents) => {
              // Filter new events through shouldHideEvent
              const filteredNewEvents = newEvents.filter((evt) => !shouldHideEvent(evt))

              // do everything inside this setter otherwise it's impossible to get the latest state
              setNoteGroups((curr) => {
                const pending: NostrEvent[] = []
                const appended: NostrEvent[] = []

                for (let i = 0; i < filteredNewEvents.length; i++) {
                  const newEvent = filteredNewEvents[i]

                  // TODO: figure out where exactly the viewport is: for now just assume it's at the top
                  if (
                    curr.noteGroups.length < 7 ||
                    newEvent.created_at < curr.noteGroups[6].topNote.created_at ||
                    curr.noteGroups
                      .slice(0, 6)
                      .some((group) => group.topNote.pubkey === newEvent.pubkey)
                  ) {
                    // if there are very few events in the viewport or the new events would be inserted below
                    // or they authored by any of the top authors (but they wouldn't be their top notes), just append
                    appended.push(newEvent)
                  } else if (pubkey && newEvent.pubkey === pubkey) {
                    // our own notes are also inserted regardless of any concern
                    appended.push(newEvent)
                  } else {
                    // any other "new" notes that would be inserted above, make them be pending in the modal thing
                    pending.push(newEvent)
                  }
                }

                // prepend them to the top (no need to sort as they will be sorted on mergeNewEvents)
                if (pending.length) {
                  setNewEvents((curr) => [...pending, ...curr])
                }

                if (appended.length) {
                  // merging these will trigger a group recomputation
                  setEvents((oldEvents) => {
                    // we have no idea of the order here, so just sort everything and eliminate duplicates
                    const all = [...oldEvents, ...appended].sort(
                      (a, b) => b.created_at - a.created_at
                    )
                    return all.filter((evt, i) => i === 0 || evt.id !== all[i - 1].id)
                  })
                }

                return curr
              })
            },
            1800,
            3000
          ),
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
    }, [subRequests, refreshCount, showKinds, settings, shouldHideEvent])

    function mergeNewEvents() {
      setEvents((oldEvents) =>
        // we must sort here because the group calculation assumes everything is sorted
        [...newEvents, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
      )
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    if (hasNoResults) {
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
      <div className="min-h-screen" style={{ overflowAnchor: 'none' }}>
        {nameFilteredGroups.map(({ totalNotes, oldestTimestamp, allNoteTimestamps, topNote }) => {
          // use CompactedNoteCard if compacted view is on
          if (settings.compactedView) {
            const readStatus = getReadStatus(topNote.pubkey, topNote.created_at)
            const unreadCount = getUnreadCount(topNote.pubkey, allNoteTimestamps)

            return (
              <CompactedEventCard
                key={topNote.id}
                className="w-full"
                event={topNote}
                variant={topNote.kind === kinds.Repost ? 'repost' : 'note'}
                totalNotesInTimeframe={unreadCount}
                oldestTimestamp={oldestTimestamp}
                filterMutedNotes={filterMutedNotes}
                isSelected={selectedNoteId === topNote.id}
                onSelect={() => setSelectedNoteId(topNote.id)}
                onLastNoteRead={() => {
                  // If there's only one note, mark all as read instead of just last
                  if (totalNotes === 1) {
                    markAllNotesRead(topNote.pubkey, topNote.created_at, unreadCount)
                  } else {
                    markLastNoteRead(topNote.pubkey, topNote.created_at, unreadCount)
                  }
                }}
                onAllNotesRead={() =>
                  markAllNotesRead(topNote.pubkey, topNote.created_at, unreadCount)
                }
                onMarkAsUnread={() => markAsUnread(topNote.pubkey)}
                isLastNoteRead={readStatus.isLastNoteRead}
                areAllNotesRead={readStatus.areAllNotesRead}
              />
            )
          }

          // otherwise use regular NoteCard
          const unreadCount = totalNotes
            ? getUnreadCount(topNote.pubkey, allNoteTimestamps)
            : totalNotes
          const readStatus = totalNotes
            ? getReadStatus(topNote.pubkey, topNote.created_at)
            : { isLastNoteRead: false, areAllNotesRead: false }

          return (
            <NoteCard
              key={topNote.id}
              className="w-full"
              event={topNote}
              filterMutedNotes={filterMutedNotes}
              groupedNotesTotalCount={unreadCount}
              groupedNotesOldestTimestamp={oldestTimestamp}
              onAllNotesRead={() =>
                unreadCount && markAllNotesRead(topNote.pubkey, topNote.created_at, unreadCount)
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
