import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { SEARCHABLE_RELAY_URLS } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import relayInfoService from '@/services/relay-info.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'
import { current, outbox, ready } from '@/services/outbox.service'
import { loadPins } from '@nostr/gadgets/lists'

export default function ProfileFeed({
  pubkey,
  topSpace = 0,
  sinceTimestamp,
  fromGrouped = false,
  search = ''
}: {
  pubkey: string
  topSpace?: number
  sinceTimestamp?: number
  fromGrouped?: boolean
  search?: string
}) {
  const { pubkey: myPubkey, pinList: myPinList } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([])
  const [totalItemsCount, setTotalItemsCount] = useState(0)

  // Threshold for showing tabs - only show tabs if total items > 20
  const TABS_THRESHOLD = 20
  const shouldShowTabs = useMemo(() => {
    // When coming from grouped notes, only show tabs if total items > threshold
    if (fromGrouped) {
      return totalItemsCount > TABS_THRESHOLD
    }
    // Always show tabs when not from grouped notes
    return true
  }, [fromGrouped, totalItemsCount])

  const tabs = useMemo(() => {
    const _tabs = [{ value: 'posts', label: 'Notes' }]

    // Show Replies tab only if includeReplies is enabled when coming from grouped notes
    // AND if we should show tabs at all
    if (shouldShowTabs && (!fromGrouped || groupedNotesSettings.includeReplies)) {
      _tabs.push({ value: 'postsAndReplies', label: 'Replies' })
    }

    // Hide You tab when coming from grouped notes
    if (myPubkey && myPubkey !== pubkey && !fromGrouped) {
      _tabs.push({ value: 'you', label: 'YouTabName' })
    }

    return _tabs
  }, [myPubkey, pubkey, fromGrouped, groupedNotesSettings.includeReplies, shouldShowTabs])

  const supportTouch = useMemo(() => isTouchDevice(), [])
  const noteListRef = useRef<TNoteListRef>(null)

  useEffect(() => {
    ;(async () => {
      let pinList: string[]
      if (pubkey === myPubkey) {
        pinList = myPinList
      } else {
        pinList = (await loadPins(pubkey)).items
      }
      setPinnedEventIds(pinList)
    })()
  }, [pubkey, myPubkey, myPinList])

  useEffect(() => {
    const abort = new AbortController()

    ready()
      .then(() =>
        outbox.sync([pubkey], {
          signal: abort.signal
        })
      )
      .catch((err) => {
        console.warn(`bailing on single-profile sync: ${err}`)
      })

    current.pubkey = pubkey

    return () => {
      abort.abort('<cancelled>')
      current.pubkey = null
    }
  }, [pubkey])

  useEffect(() => {
    ;(async () => {
      if (listMode === 'you') {
        if (!myPubkey) {
          setSubRequests([])
          return
        }

        setSubRequests([
          {
            source: 'local',
            filter: {
              authors: [myPubkey],
              '#p': [pubkey]
            }
          },
          {
            source: 'local',
            filter: {
              authors: [pubkey],
              '#p': [myPubkey]
            }
          }
        ])
        return
      }

      const relayList = await client.fetchRelayList(pubkey)

      if (search) {
        const writeRelays = relayList.write.slice(0, 8)
        const relayInfos = await relayInfoService.getRelayInfos(writeRelays)
        const searchableRelays = writeRelays.filter((_, index) =>
          relayInfos[index]?.supported_nips?.includes(50)
        )
        setSubRequests([
          {
            source: 'relays',
            urls: searchableRelays.concat(SEARCHABLE_RELAY_URLS).slice(0, 8),
            filter: { authors: [pubkey], search }
          }
        ])
      } else {
        setSubRequests([
          {
            source: 'local',
            filter: {
              authors: [pubkey]
            }
          }
        ])
      }
    })()
  }, [pubkey, listMode, search])

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop('instant')
  }

  const handleNotesLoaded = (
    hasNotes: boolean,
    hasReplies: boolean,
    notesCount: number,
    repliesCount: number
  ) => {
    // Update total count
    const totalCount = notesCount + repliesCount
    setTotalItemsCount(totalCount)

    // If below threshold, force showing all items together (no tab separation)
    if (fromGrouped && totalCount <= TABS_THRESHOLD) {
      // Don't filter by hideReplies, show everything together
      return
    }

    // Auto-switch to Replies tab if coming from grouped notes and there are only replies (no notes)
    if (
      fromGrouped &&
      !hasAutoSwitched &&
      !hasNotes &&
      hasReplies &&
      groupedNotesSettings.includeReplies &&
      totalCount > TABS_THRESHOLD
    ) {
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
        hideTabs={fromGrouped && !shouldShowTabs}
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
        hideReplies={
          fromGrouped && totalItemsCount <= TABS_THRESHOLD
            ? false // Show everything together when below threshold
            : listMode === 'posts'
        }
        showOnlyReplies={
          fromGrouped && totalItemsCount > TABS_THRESHOLD && listMode === 'postsAndReplies'
        }
        filterMutedNotes={false}
        sinceTimestamp={sinceTimestamp}
        onNotesLoaded={fromGrouped ? handleNotesLoaded : undefined}
        pinnedEventIds={listMode === 'you' || !!search || !!sinceTimestamp ? [] : pinnedEventIds}
      />
    </>
  )
}
