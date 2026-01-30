import NoteList from '@/components/NoteList'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { getTimeFrameInMs } from '@/providers/GroupedNotesProvider'
import { isReplyNoteEvent, isFirstLevelReply } from '@/lib/event'
import { toProfile } from '@/lib/link'
import { SecondaryPageLink } from '@/PageManager'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { TNoteListRef } from '@/components/NoteList'
import { Event } from '@nostr/tools/wasm'
import { useTranslation } from 'react-i18next'

export default function GroupedProfileFeed({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { isReady, pubkey: myPubkey } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const { isEventDeleted } = useDeletedEvent()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const noteListRef = useRef<TNoteListRef>(null)

  // Calculate timeframe boundary from grouped notes settings
  const timeframeMs = getTimeFrameInMs(groupedNotesSettings.timeFrame)
  const groupedNotesSince = Math.floor((Date.now() - timeframeMs) / 1000)

  useEffect(() => {
    ;(async () => {
      if (myPubkey === pubkey && !isReady) return
      const relayList = await client.fetchRelayList(pubkey)

      if (isReady) {
        setSubRequests([
          {
            source: 'local',
            filter: {
              authors: [pubkey]
            }
          }
        ])
      } else {
        setSubRequests([
          {
            source: 'relays',
            urls: relayList.write,
            filter: {
              authors: [pubkey]
            }
          }
        ])
      }
    })()
  }, [pubkey, isReady])

  // Filter function to apply grouped notes settings
  const filterFn = (event: Event): boolean => {
    // Filter deleted events
    if (isEventDeleted(event)) {
      return false
    }

    // Filter nested replies when showOnlyFirstLevelReplies is enabled
    if (
      groupedNotesSettings.includeReplies &&
      groupedNotesSettings.showOnlyFirstLevelReplies &&
      isReplyNoteEvent(event) &&
      !isFirstLevelReply(event)
    ) {
      return false
    }

    // Apply word filter
    if (groupedNotesSettings.wordFilter.trim()) {
      const filterWords = groupedNotesSettings.wordFilter
        .split(',')
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word.length > 0)

      if (filterWords.length > 0) {
        const content = (event.content || '').toLowerCase()
        const hashtags = event.tags
          .filter((tag) => tag[0] === 't' && tag[1])
          .map((tag) => tag[1].toLowerCase())

        const hasMatchInContent = filterWords.some((word) => content.includes(word))
        const hasMatchInHashtags = filterWords.some((word) =>
          hashtags.some((hashtag) => hashtag.includes(word))
        )

        if (hasMatchInContent || hasMatchInHashtags) {
          return false
        }
      }
    }

    // Apply short notes filter
    if (groupedNotesSettings.hideShortNotes) {
      const content = (event.content || '').trim()

      if (content.length < 10) {
        return false
      }

      const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
      const contentWithoutEmojis = content.replace(emojiRegex, '').replace(/\s+/g, '').trim()
      if (contentWithoutEmojis.length < 2) {
        return false
      }

      const words = content.split(/\s+/).filter((word) => word.length > 0)
      if (words.length === 1) {
        return false
      }
    }

    return true
  }

  // Custom footer for filtered view
  const customFooter = (
    <div className="flex justify-center items-center mt-4 p-4">
      <SecondaryPageLink
        to={toProfile(pubkey)}
        className="text-primary hover:underline text-base font-medium"
      >
        {t('Show full profile')}
      </SecondaryPageLink>
    </div>
  )

  return (
    <NoteList
      ref={noteListRef}
      subRequests={subRequests}
      showKinds={showKinds}
      hideReplies={!groupedNotesSettings.includeReplies}
      filterMutedNotes={false}
      sinceTimestamp={groupedNotesSince}
      filterFn={filterFn}
      customFilteredFooter={customFooter}
    />
  )
}
