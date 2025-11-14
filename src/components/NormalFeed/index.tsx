import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { Input } from '@/components/ui/input'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import KindFilter from '../KindFilter'
import GroupedNotesFilter from '../GroupedNotesFilter'
import { RefreshButton } from '../RefreshButton'

export default function NormalFeed({
  subRequests,
  isMainFeed = false,
  showRelayCloseReason = false
}: {
  subRequests: TFeedSubRequest[]
  isMainFeed?: boolean
  showRelayCloseReason?: boolean
}) {
  const { t } = useTranslation()
  const { hideUntrustedNotes } = useUserTrust()
  const { showKinds } = useKindFilter()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const [userFilter, setUserFilter] = useState('')
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
      {groupedNotesSettings.enabled ? (
        /* Custom header for grouped mode with filter input */
        <div className="sticky flex items-center justify-between top-12 bg-background z-30 px-4 py-2 w-full border-b gap-3">
          <div
            tabIndex={0}
            className="relative flex w-full items-center rounded-md border border-input px-3 py-1 text-base transition-colors md:text-sm [&:has(:focus-visible)]:ring-ring [&:has(:focus-visible)]:ring-1 [&:has(:focus-visible)]:outline-none bg-surface-background shadow-inner h-full border-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-search size-4 shrink-0 opacity-50"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>

            <Input
              type="text"
              placeholder={t('GroupedNotesFilter')}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              showClearButton={true}
              onClear={() => setUserFilter('')}
              className="flex-1 h-9 size-full shadow-none border-none bg-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-1">
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
            <GroupedNotesFilter />
          </div>
        </div>
      ) : (
        /* Standard tabs for non-grouped mode */
        <Tabs
          value={effectiveListMode}
          tabs={availableTabs}
          onTabChange={(listMode) => {
            handleListModeChange(listMode as TNoteListMode)
          }}
          options={
            <>
              {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
              <KindFilter
                showKinds={temporaryShowKinds}
                onShowKindsChange={handleShowKindsChange}
              />
              <GroupedNotesFilter />
            </>
          }
        />
      )}
      <NoteList
        ref={noteListRef}
        showKinds={temporaryShowKinds}
        subRequests={subRequests}
        hideReplies={
          effectiveListMode === 'posts' &&
          !(groupedNotesSettings.enabled && groupedNotesSettings.includeReplies)
        }
        hideUntrustedNotes={hideUntrustedNotes}
        showRelayCloseReason={showRelayCloseReason}
        groupedMode={groupedNotesSettings.enabled}
        userFilter={userFilter}
      />
    </>
  )
}
