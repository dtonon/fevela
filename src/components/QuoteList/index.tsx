import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import dayjs from 'dayjs'
import { Event } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'
import { TFeedSubRequest } from '@/types'

const LIMIT = 100
const SHOW_COUNT = 10

export default function QuoteList({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const { startLogin } = useNostr()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ;(async () => {
      const relayList = await client.fetchRelayList(event.pubkey)
      const relayUrls = relayList.read.concat(BIG_RELAY_URLS)
      const seenOn = client.getSeenEventRelayUrls(event.id)
      relayUrls.unshift(...seenOn)

      setSubRequests([
        {
          source: 'relays',
          urls: relayUrls,
          filter: {
            '#q': [
              isReplaceableEvent(event.kind) ? getReplaceableCoordinateFromEvent(event) : event.id
            ],
            kinds: [
              kinds.ShortTextNote,
              kinds.Highlights,
              kinds.LongFormArticle,
              ExtendedKind.COMMENT,
              ExtendedKind.POLL
            ]
          }
        }
      ])
    })()
  }, [event])

  useEffect(() => {
    setLoading(true)
    setEvents([])
    setHasMore(true)

    const subc = client.subscribeTimeline(
      subRequests,
      { limit: LIMIT },
      {
        onEvents: (events) => {
          if (events.length > 0) {
            setEvents(events)
          }
          setLoading(false)
          setHasMore(events.length > 0)
        },
        onNew: (event) => {
          setEvents((oldEvents) =>
            [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
          )
        }
      },
      { startLogin }
    )
    return () => subc.close()
  }, [subRequests])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    async function loadMore() {
      if (showCount < events.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
        // preload more
        if (events.length - showCount > LIMIT / 2) {
          return
        }
      }

      if (loading || !hasMore) return
      setLoading(true)
      const newEvents = await client.loadMoreTimeline(subRequests, {
        until: events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
        limit: LIMIT
      })
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
  }, [loading, hasMore, events, showCount])

  return (
    <div className={className}>
      <div className="min-h-[80vh]">
        <div>
          {events.slice(0, showCount).map((event) => {
            if (hideUntrustedInteractions && !isUserTrusted(event.pubkey)) {
              return null
            }
            return <NoteCard key={event.id} className="w-full" event={event} />
          })}
        </div>
        {hasMore || loading ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
        )}
      </div>
      <div className="h-40" />
    </div>
  )
}
