import { buildATag, buildETag, createBookmarkDraftEvent } from '@/lib/draft-event'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import client from '@/services/client.service'
import { Event } from '@nostr/tools/wasm'
import { createContext, useContext } from 'react'
import { useNostr } from './NostrProvider'

type TBookmarksContext = {
  addBookmark: (event: Event) => Promise<void>
  removeBookmark: (event: Event) => Promise<void>
}

const BookmarksContext = createContext<TBookmarksContext | undefined>(undefined)

export const useBookmarks = () => {
  const context = useContext(BookmarksContext)
  if (!context) {
    throw new Error('useBookmarks must be used within a BookmarksProvider')
  }
  return context
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const { pubkey: accountPubkey, publish, updateBookmarkListEvent } = useNostr()

  const addBookmark = async (event: Event) => {
    if (!accountPubkey) return

    const bookmarkList = await client.loadBookmarks(accountPubkey)
    const currentTags = bookmarkList.event?.tags || []
    const isReplaceable = isReplaceableEvent(event.kind)
    const eventKey = isReplaceable ? getReplaceableCoordinateFromEvent(event) : event.id

    if (
      currentTags.some((tag) =>
        isReplaceable
          ? tag[0] === 'a' && tag[1] === eventKey
          : tag[0] === 'e' && tag[1] === eventKey
      )
    ) {
      return
    }

    await updateBookmarkListEvent(
      await publish(
        createBookmarkDraftEvent(
          [...currentTags, isReplaceable ? buildATag(event) : buildETag(event.id, event.pubkey)],
          bookmarkList.event?.content
        )
      )
    )
  }

  const removeBookmark = async (event: Event) => {
    if (!accountPubkey) return

    const bookmarkList = await client.loadBookmarks(accountPubkey)
    if (!bookmarkList.event) return

    const isReplaceable = isReplaceableEvent(event.kind)
    const eventKey = isReplaceable ? getReplaceableCoordinateFromEvent(event) : event.id

    const newTags = bookmarkList.event.tags.filter((tag) =>
      isReplaceable ? tag[0] !== 'a' || tag[1] !== eventKey : tag[0] !== 'e' || tag[1] !== eventKey
    )
    if (newTags.length === bookmarkList.event.tags.length) return

    await updateBookmarkListEvent(
      await publish(createBookmarkDraftEvent(newTags, bookmarkList.event.content))
    )
  }

  return (
    <BookmarksContext.Provider
      value={{
        addBookmark,
        removeBookmark
      }}
    >
      {children}
    </BookmarksContext.Provider>
  )
}
