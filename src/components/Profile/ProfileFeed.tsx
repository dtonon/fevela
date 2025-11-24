import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs, { TTabDefinition } from '@/components/Tabs'
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

const TABS_THRESHOLD = 20

export default function ProfileFeed({
  pubkey,
  topSpace = 0,
  search = ''
}: {
  pubkey: string
  topSpace?: number
  search?: string
}) {
  const { pubkey: myPubkey, pinList: myPinList, isReady } = useNostr()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const [hasForceSet, setHasForceSet] = useState<boolean>(false)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([])

  // when coming from the grouped notes view this will be maximum timestamp threshold
  const groupedSince = parseInt(new URLSearchParams(window.location.search).get('gs') || '0')

  // threshold for showing tabs - only show tabs in grouped notes view if total items > 20
  const [displayTabs, setDisplayTabs] = useState(groupedSince > 0)

  const tabs: TTabDefinition[] = groupedSince
    ? [
        { value: 'posts', label: 'Notes' },
        { value: 'replies', label: 'Replies' }
      ]
    : [
        { value: 'posts', label: 'Notes' },
        { value: 'postsAndReplies', label: 'Replies' }
      ]

  if (myPubkey && myPubkey !== pubkey) {
    tabs.push({ value: 'you', label: 'YouTabName' })
  }

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
        if (!isReady || !myPubkey) {
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

      if (myPubkey === pubkey && !isReady) return
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
        return
      }
    })()
  }, [pubkey, listMode, search, isReady])

  useEffect(() => {
    ;(async () => {
      if (search || listMode === 'you') return // will be handled on the useEffect above

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
        const relayList = await client.fetchRelayList(pubkey)
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

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop('instant')
  }

  const handleNotesLoaded = (count: number, hasPosts: boolean, hasReplies: boolean) => {
    const displayOnGrouped =
      groupedSince &&
      groupedNotesSettings.includeReplies &&
      count > TABS_THRESHOLD &&
      hasPosts &&
      hasReplies

    setDisplayTabs(displayOnGrouped || !groupedSince)

    if (displayOnGrouped && !hasForceSet) {
      setListMode('posts')
      setHasForceSet(true)
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
        hideTabs={!displayTabs}
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
        showOnlyReplies={listMode === 'replies'}
        filterMutedNotes={false}
        sinceTimestamp={groupedSince}
        onNotesLoaded={handleNotesLoaded}
        pinnedEventIds={listMode === 'you' || !!search || groupedSince ? undefined : pinnedEventIds}
      />
    </>
  )
}
