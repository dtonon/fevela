import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { SEARCHABLE_RELAY_URLS } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import relayInfoService from '@/services/relay-info.service'
import { TFeedSubRequest } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'
import { outbox, ready } from '@/services/outbox.service'
import { loadPins } from '@nostr/gadgets/lists'
import { useFeed } from '@/providers/FeedProvider'

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
  const { settings: feedSettings, updateSettings } = useFeed()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)

  // when coming from the grouped notes view this will be maximum timestamp threshold
  const groupedSince = parseInt(new URLSearchParams(window.location.search).get('gs') || '0')

  const [onlyYou, setOnlyYou] = useState(false)
  const [hasForceSet, setHasForceSet] = useState<boolean>(false)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([])

  // threshold for showing tabs - only show tabs in grouped notes view if total items > 20
  const [displayTabs, setDisplayTabs] = useState(groupedSince > 0)

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

    return () => {
      abort.abort('<cancelled>')
    }
  }, [pubkey])

  useEffect(() => {
    ;(async () => {
      if (onlyYou) {
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
  }, [pubkey, onlyYou, search, isReady])

  useEffect(() => {
    ;(async () => {
      if (search || onlyYou) return // will be handled on the useEffect above

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

  return (
    <>
      <Tabs
        value={feedSettings.includeReplies ? 'postsAndReplies' : 'posts'}
        tabs={[
          { value: 'posts', label: 'Notes' },
          { value: 'postsAndReplies', label: 'All' },
          ...(myPubkey && myPubkey !== pubkey ? [{ value: 'you', label: 'YouTabName' }] : [])
        ]}
        onTabChange={(tabName) => {
          switch (tabName) {
            case 'you':
              setOnlyYou(true)
              updateSettings({ includeReplies: true })
              break
            case 'postsAndReplies':
              updateSettings({ includeReplies: true })
              break
            case 'posts':
              updateSettings({ includeReplies: false })
              break
          }

          noteListRef.current?.scrollToTop('smooth')
        }}
        threshold={Math.max(800, topSpace)}
        hideTabs={!displayTabs}
        options={
          <>
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter
              showKinds={temporaryShowKinds}
              onShowKindsChange={(newShowKinds: number[]) => {
                setTemporaryShowKinds(newShowKinds)
                noteListRef.current?.scrollToTop('instant')
              }}
            />
          </>
        }
      />
      <NoteList
        ref={noteListRef}
        subRequests={subRequests}
        showKinds={temporaryShowKinds}
        hideReplies={!feedSettings.includeReplies}
        filterMutedNotes={false}
        sinceTimestamp={groupedSince}
        onNotesLoaded={(count: number, hasPosts: boolean, hasReplies: boolean) => {
          const displayOnGrouped =
            groupedSince &&
            feedSettings.includeReplies &&
            count > TABS_THRESHOLD &&
            hasPosts &&
            hasReplies

          setDisplayTabs(displayOnGrouped || !groupedSince)

          if (displayOnGrouped && !hasForceSet) {
            updateSettings({ includeReplies: true })
            setHasForceSet(true)
          }
        }}
        pinnedEventIds={onlyYou || !!search || groupedSince ? undefined : pinnedEventIds}
      />
    </>
  )
}
