import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { BIG_RELAY_URLS, MAX_PINNED_NOTES, SEARCHABLE_RELAY_URLS } from '@/constants'
import { generateBech32IdFromETag } from '@/lib/tag'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import relayInfoService from '@/services/relay-info.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { NostrEvent } from 'nostr-tools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'

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
  const { pubkey: myPubkey, pinListEvent: myPinListEvent } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([])
  const tabs = useMemo(() => {
    const _tabs = [{ value: 'posts', label: 'Notes' }]

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
  const noteListRef = useRef<TNoteListRef>(null)

  useEffect(() => {
    const initPinnedEventIds = async () => {
      let evt: NostrEvent | null = null
      if (pubkey === myPubkey) {
        evt = myPinListEvent
      } else {
        evt = await client.fetchPinListEvent(pubkey)
      }
      const hexIdSet = new Set<string>()
      const ids =
        (evt?.tags
          .filter((tag) => tag[0] === 'e')
          .reverse()
          .slice(0, MAX_PINNED_NOTES)
          .map((tag) => {
            const [, hexId, relay, _pubkey] = tag
            if (!hexId || hexIdSet.has(hexId) || (_pubkey && _pubkey !== pubkey)) {
              return undefined
            }

            const id = generateBech32IdFromETag(['e', hexId, relay ?? '', pubkey])
            if (id) {
              hexIdSet.add(hexId)
            }
            return id
          })
          .filter(Boolean) as string[]) ?? []
      setPinnedEventIds(ids)
    }
    initPinnedEventIds()
  }, [pubkey, myPubkey, myPinListEvent])

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

      if (search) {
        const writeRelays = relayList.write.slice(0, 8)
        const relayInfos = await relayInfoService.getRelayInfos(writeRelays)
        const searchableRelays = writeRelays.filter((_, index) =>
          relayInfos[index]?.supported_nips?.includes(50)
        )
        setSubRequests([
          {
            urls: searchableRelays.concat(SEARCHABLE_RELAY_URLS).slice(0, 8),
            filter: { authors: [pubkey], search }
          }
        ])
      } else {
        setSubRequests([
          {
            urls: relayList.write.concat(BIG_RELAY_URLS).slice(0, 8),
            filter: {
              authors: [pubkey]
            }
          }
        ])
      }
    }
    init()
  }, [pubkey, listMode, search])

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop('instant')
  }

  const handleNotesLoaded = (hasNotes: boolean, hasReplies: boolean) => {
    // Auto-switch to Replies tab if coming from grouped notes and there are only replies (no notes)
    if (
      fromGrouped &&
      !hasAutoSwitched &&
      !hasNotes &&
      hasReplies &&
      groupedNotesSettings.includeReplies
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
        pinnedEventIds={listMode === 'you' || !!search ? [] : pinnedEventIds}
      />
    </>
  )
}
