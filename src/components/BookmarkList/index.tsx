import { useFetchEvent } from '@/hooks'
import { useNostr } from '@/providers/NostrProvider'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'
import { isHex32 } from '@nostr/gadgets/utils'
import { neventEncode, naddrEncode } from '@nostr/tools/nip19'

const SHOW_COUNT = 10

export default function BookmarkList() {
  const { t } = useTranslation()
  const { bookmarkList } = useNostr()
  const eventIds = useMemo(() => {
    return bookmarkList
      .map((bookmark) => {
        if (isHex32(bookmark)) {
          return neventEncode({ id: bookmark })
        } else {
          const [kind, pubkey, identifier] = bookmark.split(':')
          return naddrEncode({
            kind: parseInt(kind),
            pubkey,
            identifier
          })
        }
      })
      .reverse()
  }, [bookmarkList])
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const loadMore = () => {
      if (showCount < eventIds.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
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
  }, [showCount, eventIds])

  if (eventIds.length === 0) {
    return (
      <div className="mt-2 text-sm text-center text-muted-foreground">
        {t('no bookmarks found')}
      </div>
    )
  }

  return (
    <div>
      {eventIds.slice(0, showCount).map((eventId) => (
        <BookmarkedNote key={eventId} eventId={eventId} />
      ))}

      {showCount < eventIds.length ? (
        <div ref={bottomRef}>
          <NoteCardLoadingSkeleton />
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground mt-2">
          {t('no more bookmarks')}
        </div>
      )}
    </div>
  )
}

function BookmarkedNote({ eventId }: { eventId: string }) {
  const { event, isFetching } = useFetchEvent(eventId)

  if (isFetching) {
    return <NoteCardLoadingSkeleton />
  }

  if (!event) {
    return null
  }

  return <NoteCard event={event} className="w-full" />
}
