import NoteCard, { NoteCardLoadingSkeleton } from '@/components/NoteCard'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { NostrEvent } from '@nostr/tools/wasm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const SHOW_COUNT = 10

export default function TrendingNotes() {
  const { t } = useTranslation()
  const { isEventDeleted } = useDeletedEvent()
  const { hideUntrustedNotes, isUserTrusted } = useUserTrust()
  const [trendingNotes, setTrendingNotes] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const filteredEvents = useMemo(() => {
    const idSet = new Set<string>()

    return trendingNotes.slice(0, showCount).filter((evt) => {
      if (isEventDeleted(evt)) return false
      if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return false

      const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
      if (idSet.has(id)) {
        return false
      }
      idSet.add(id)
      return true
    })
  }, [trendingNotes, hideUntrustedNotes, showCount, isEventDeleted])

  useEffect(() => {
    const fetchTrendingPosts = async () => {
      setLoading(true)
      const events = await client.fetchTrendingNotes()
      setTrendingNotes(events)
      setLoading(false)
    }

    fetchTrendingPosts()
  }, [])

  useEffect(() => {
    if (showCount >= trendingNotes.length) return

    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShowCount((prev) => prev + SHOW_COUNT)
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
  }, [loading, trendingNotes, showCount])

  return (
    <div className="min-h-screen">
      <div className="sticky top-12 h-12 px-4 flex flex-col justify-center text-lg font-bold bg-background z-30 border-b">
        {t('Trending Notes')}
      </div>
      {filteredEvents.map((event) => (
        <NoteCard key={event.id} className="w-full" event={event} />
      ))}
      {showCount < trendingNotes.length || loading ? (
        <div ref={bottomRef}>
          <NoteCardLoadingSkeleton />
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
      )}
    </div>
  )
}
