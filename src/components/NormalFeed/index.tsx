import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useMemo, useRef, useState } from 'react'
import KindFilter from '../KindFilter'
import GroupedNotesFilter from '../GroupedNotesFilter'
import { RefreshButton } from '../RefreshButton'

export default function NormalFeed({
  subRequests,
  areAlgoRelays = false,
  isMainFeed = false,
  showRelayCloseReason = false
}: {
  subRequests: TFeedSubRequest[]
  areAlgoRelays?: boolean
  isMainFeed?: boolean
  showRelayCloseReason?: boolean
}) {
  const { hideUntrustedNotes } = useUserTrust()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const noteListRef = useRef<TNoteListRef>(null)

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    if (isMainFeed) {
      storage.setNoteListMode(mode)
    }
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop()
  }

  // In grouped mode, force 'posts' mode and disable replies tab
  const effectiveListMode = groupedNotesSettings.enabled ? 'posts' : listMode
  const availableTabs = groupedNotesSettings.enabled
    ? [{ value: 'posts', label: 'Notes' }]
    : [
        { value: 'posts', label: 'Notes' },
        { value: 'postsAndReplies', label: 'Replies' }
      ]

  return (
    <>
      <Tabs
        value={effectiveListMode}
        tabs={availableTabs}
        onTabChange={(listMode) => {
          if (!groupedNotesSettings.enabled) {
            handleListModeChange(listMode as TNoteListMode)
          }
        }}
        options={
          <>
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
            <GroupedNotesFilter />
          </>
        }
      />
      <NoteList
        ref={noteListRef}
        showKinds={temporaryShowKinds}
        subRequests={subRequests}
        hideReplies={effectiveListMode === 'posts'}
        hideUntrustedNotes={hideUntrustedNotes}
        areAlgoRelays={areAlgoRelays}
        showRelayCloseReason={showRelayCloseReason}
        groupedMode={groupedNotesSettings.enabled}
      />
    </>
  )
}
