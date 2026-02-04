import { SubCloser } from '@nostr/tools/abstract-pool'
import { parse } from '@nostr/tools/nip27'
import { NOTIFICATION_LIST_STYLE } from '@/constants'
import { compareEvents } from '@/lib/event'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import dayjs from 'dayjs'
import { NostrEvent } from '@nostr/tools/wasm'
import { matchFilter } from '@nostr/tools/filter'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PullToRefresh from 'react-simple-pull-to-refresh'
import { NotificationItem } from '../NotificationList/NotificationItem'
import { NotificationSkeleton } from '../NotificationList/NotificationItem/Notification'
import { isTouchDevice } from '@/lib/utils'
import { RefreshButton } from '../RefreshButton'
import { Input } from '@/components/ui/input'
import { TFeedSubRequest } from '@/types'
import { useNotification } from '@/providers/NotificationProvider'
import { replyKinds } from '@/lib/notification'

const LIMIT = 100
const SHOW_COUNT = 30

const ConversationList = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { current, display } = usePrimaryPage()
  const active = useMemo(() => current === 'conversations' && display, [current, display])
  const { pubkey } = useNostr()
  const { getNotificationsSeenAt } = useNotification()
  const { notificationListStyle } = useUserPreferences()
  const [refreshCount, setRefreshCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<NostrEvent[]>([])
  const [lastReadTime, setLastReadTime] = useState(0)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [until, setUntil] = useState<number | undefined>(dayjs().unix())
  const [userFilter, setUserFilter] = useState('')
  const [matchingPubkeys, setMatchingPubkeys] = useState<Set<string> | null>(null)
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Search for matching pubkeys when user filter changes
  useEffect(() => {
    if (!userFilter.trim()) {
      setMatchingPubkeys(null)
      return
    }

    const searchProfiles = async () => {
      try {
        const pubkeys = await client.searchPubKeysFromLocal(userFilter, 1000)
        setMatchingPubkeys(new Set(pubkeys))
      } catch (e) {
        console.error('Error searching profiles:', e)
        setMatchingPubkeys(new Set())
      }
    }

    searchProfiles()
  }, [userFilter])

  // Apply user filter (by author name or content)
  const filteredConversations = useMemo(() => {
    if (!userFilter.trim()) {
      return conversations
    }

    const filterLower = userFilter.toLowerCase()
    return conversations.filter((event) => {
      // Check if author matches
      if (matchingPubkeys && matchingPubkeys.has(event.pubkey)) {
        return true
      }

      // Check if content matches
      if (event.content && event.content.toLowerCase().includes(filterLower)) {
        return true
      }

      return false
    })
  }, [conversations, userFilter, matchingPubkeys])

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

  useEffect(() => {
    if (current !== 'conversations') return
    if (!pubkey) {
      setUntil(undefined)
      return
    }

    let subc: SubCloser | undefined
    ;(async () => {
      setLoading(true)
      setConversations([])
      setShowCount(SHOW_COUNT)
      setLastReadTime(getNotificationsSeenAt())

      const relayList = await client.fetchRelayList(pubkey)

      const subRequests: TFeedSubRequest[] = [
        {
          source: 'relays',
          urls: relayList.read,
          filter: {
            '#p': [pubkey],
            kinds: replyKinds
          }
        },
        {
          source: 'local',
          filter: {
            '#p': [pubkey],
            kinds: replyKinds
          }
        },
        {
          source: 'local',
          filter: {
            authors: [pubkey],
            kinds: replyKinds
          }
        }
      ]

      setSubRequests(subRequests)

      // Check if an event is an explicit mention in content (but not user's own post)
      // (we don't want mentions, we only want replies)

      subc = client.subscribeTimeline(
        subRequests,
        { limit: LIMIT },
        {
          onEvents: (events, isFinal) => {
            if (events.length > 0) {
              const conversations = events.filter(
                (evt) => evt.pubkey == pubkey || !eventMentionsPubkey(evt, pubkey)
              )
              setConversations(conversations)
            }

            if (isFinal) {
              setUntil(events.length > 0 ? events[events.length - 1].created_at - 1 : undefined)
              noteStatsService.updateNoteStatsByEvents(events)
            }
          },
          onNew: (event) => {
            if (event.pubkey == pubkey || !eventMentionsPubkey(event, pubkey)) handleNewEvent(event)
          }
        }
      )
    })()

    return () => subc?.close?.()
  }, [pubkey, refreshCount, current])

  useEffect(() => {
    if (!active || !pubkey) return

    const handler = (data: Event) => {
      const customEvent = data as CustomEvent<NostrEvent>
      const evt = customEvent.detail
      if (
        matchFilter(
          {
            kinds: replyKinds,
            '#p': [pubkey]
          },
          evt
        ) ||
        matchFilter(
          {
            kinds: replyKinds,
            authors: [pubkey]
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
  }, [pubkey, active])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 1
    }

    const loadMore = async () => {
      // do these checks inside setters because react doesn't give us any other option
      setShowCount((count) => {
        // preload more?
        if (filteredConversations.length - showCount <= LIMIT / 2) {
          preloadMore()
        }

        return count + SHOW_COUNT
      })

      async function preloadMore() {
        if (!pubkey || subRequests.length === 0 || !until || loading) return

        setLoading(true)
        const newConversations = (
          await client.loadMoreTimeline(subRequests, { until, limit: LIMIT })
        ).filter((evt) => evt.pubkey == pubkey || !eventMentionsPubkey(evt, pubkey))
        setLoading(false)
        if (newConversations.length === 0) {
          setUntil(undefined)
          return
        }

        setConversations((old) => [...old, ...newConversations])
        setUntil(newConversations[newConversations.length - 1].created_at - 1)
      }
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
  }, [pubkey, filteredConversations, subRequests, until, loading])

  const refresh = () => {
    topRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
    setTimeout(() => {
      setRefreshCount((count) => count + 1)
    }, 500)
  }

  const list = (
    <div className={notificationListStyle === NOTIFICATION_LIST_STYLE.COMPACT ? 'pt-2' : ''}>
      {filteredConversations.slice(0, showCount).map((conversation) => (
        <NotificationItem
          key={conversation.id}
          notification={conversation}
          isNew={conversation.created_at > lastReadTime}
        />
      ))}
      <div className="text-center text-sm text-muted-foreground">
        {until || loading ? (
          <div ref={bottomRef}>
            <NotificationSkeleton />
          </div>
        ) : (
          t('no more conversations')
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div className="sticky flex items-center justify-between top-12 bg-background z-30 px-4 py-2 w-full border-b gap-3">
        <div
          tabIndex={0}
          className="relative flex w-full items-center rounded-md border border-input px-3 py-1 text-base transition-colors md:text-sm [&:has(:focus-visible)]:ring-ring [&:has(:focus-visible)]:ring-1 [&:has(:focus-visible)]:outline-none bg-surface-background shadow-inner h-full border-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-search size-4 shrink-0 opacity-50"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>

          <Input
            type="text"
            placeholder={t('Filter by author or content...')}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            showClearButton={true}
            onClear={() => setUserFilter('')}
            className="flex-1 h-9 size-full shadow-none border-none bg-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        </div>
        {!supportTouch && <RefreshButton onClick={() => refresh()} />}
      </div>
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

  function eventMentionsPubkey(event: NostrEvent, pubkey: string): boolean {
    for (const block of parse(event.content)) {
      // Only check for explicit mentions in content (e.g., nostr:npub... references)
      if (block.type === 'reference' && 'pubkey' in block && block.pubkey === pubkey) {
        // this is a mention
        return true
      }
    }

    return false
  }

  function handleNewEvent(event: NostrEvent) {
    setConversations((oldEvents) => {
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
  }
})

ConversationList.displayName = 'ConversationList'
export default ConversationList
