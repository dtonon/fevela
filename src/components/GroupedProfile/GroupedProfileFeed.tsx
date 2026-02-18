import NoteList from '@/components/NoteList'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { isReplyNoteEvent, isFirstLevelReply, wordsInEvent, isLongNote } from '@/lib/event'
import { toProfile } from '@/lib/link'
import { SecondaryPageLink } from '@/PageManager'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { TNoteListRef } from '@/components/NoteList'
import { Event } from '@nostr/tools/wasm'
import { useTranslation } from 'react-i18next'
import { getTimeFrameInMs, useFeed } from '@/providers/FeedProvider'

export default function GroupedProfileFeed({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { isReady, pubkey: myPubkey } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: feedSettings } = useFeed()
  const { isEventDeleted } = useDeletedEvent()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const noteListRef = useRef<TNoteListRef>(null)

  // Calculate timeframe boundary from grouped notes settings
  const timeframeMs = getTimeFrameInMs(feedSettings.groupedTimeframe)
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

    // filter nested replies when showOnlyFirstLevelReplies is enabled
    if (
      feedSettings.includeReplies &&
      feedSettings.showOnlyFirstLevelReplies &&
      isReplyNoteEvent(event) &&
      !isFirstLevelReply(event)
    ) {
      return false
    }

    // apply word filter
    if (feedSettings.wordFilter.length) {
      if (wordsInEvent(feedSettings.wordFilter, event)) return false
    }

    // apply short notes filter
    if (feedSettings.hideShortNotes) {
      if (!isLongNote(event)) return false
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
      hideReplies={!feedSettings.includeReplies}
      filterMutedNotes={false}
      sinceTimestamp={groupedNotesSince}
      filterFn={filterFn}
      customFilteredFooter={customFooter}
    />
  )
}
