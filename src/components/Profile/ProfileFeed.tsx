import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { BIG_RELAY_URLS } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'

export default function ProfileFeed({
  pubkey,
  topSpace = 0,
  sinceTimestamp,
  fromGrouped = false
}: {
  pubkey: string
  topSpace?: number
  sinceTimestamp?: number
  fromGrouped?: boolean
}) {
  const { pubkey: myPubkey } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const noteListRef = useRef<TNoteListRef>(null)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)
  const tabs = useMemo(() => {
    const _tabs = [
      { value: 'posts', label: 'Notes' }
    ]

    // Show Replies tab only if includeReplies is enabled when coming from grouped notes
    if (!fromGrouped || groupedNotesSettings.includeReplies) {
      _tabs.push({ value: 'postsAndReplies', label: 'Replies' })
    }

    // Hide You tab when coming from grouped notes
    if (myPubkey && myPubkey !== pubkey && !fromGrouped) {
      _tabs.push({ value: 'you', label: 'YouTabName' })
    }

    return _tabs
  }, [myPubkey, pubkey, fromGrouped, groupedNotesSettings.includeReplies])
  const supportTouch = useMemo(() => isTouchDevice(), [])

  useEffect(() => {
    const init = async () => {
      if (listMode === 'you') {
        if (!myPubkey) {
          setSubRequests([])
          return
        }

        const [relayList, myRelayList] = await Promise.all([
          client.fetchRelayList(pubkey),
          client.fetchRelayList(myPubkey)
        ])

        setSubRequests([
          {
            urls: myRelayList.write.concat(BIG_RELAY_URLS).slice(0, 5),
            filter: {
              authors: [myPubkey],
              '#p': [pubkey]
            }
          },
          {
            urls: relayList.write.concat(BIG_RELAY_URLS).slice(0, 5),
            filter: {
              authors: [pubkey],
              '#p': [myPubkey]
            }
          }
        ])
        return
      }

      const relayList = await client.fetchRelayList(pubkey)
      setSubRequests([
        {
          urls: relayList.write.concat(BIG_RELAY_URLS).slice(0, 8),
          filter: {
            authors: [pubkey]
          }
        }
      ])
    }
    init()
  }, [pubkey, listMode])

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop()
  }

  const handleNotesLoaded = (hasNotes: boolean, hasReplies: boolean) => {
    // Auto-switch to Replies tab if coming from grouped notes and there are only replies (no notes)
    if (fromGrouped && !hasAutoSwitched && !hasNotes && hasReplies && groupedNotesSettings.includeReplies) {
      setListMode('postsAndReplies')
      setHasAutoSwitched(true)
    }
  }

  return (
    <>
      <Tabs
        value={listMode}
        tabs={tabs}
        onTabChange={(listMode) => {
          handleListModeChange(listMode as TNoteListMode)
        }}
        threshold={Math.max(800, topSpace)}
        options={
          <>
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
          </>
        }
      />
      <NoteList
        ref={noteListRef}
        subRequests={subRequests}
        showKinds={temporaryShowKinds}
        hideReplies={listMode === 'posts'}
        showOnlyReplies={fromGrouped && listMode === 'postsAndReplies'}
        filterMutedNotes={false}
        sinceTimestamp={sinceTimestamp}
        onNotesLoaded={fromGrouped ? handleNotesLoaded : undefined}
      />
    </>
  )
}
