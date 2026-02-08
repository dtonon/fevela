import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import NoteList, { TNoteListRef } from '@/components/NoteList'
import GroupedNoteList, { TGroupedNoteListRef } from '@/components/GroupedNoteList'
import Tabs from '@/components/Tabs'
import { Input } from '@/components/ui/input'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { TFeedSubRequest } from '@/types'
import KindFilter from '../KindFilter'
import SettingsMenu from './SettingsMenu'
import { RefreshButton } from '../RefreshButton'
import { useFeed } from '@/providers/FeedProvider'

export default function NormalFeed({
  subRequests,
  showRelayCloseReason = false
}: {
  subRequests: TFeedSubRequest[]
  showRelayCloseReason?: boolean
}) {
  const { t } = useTranslation()
  const { hideUntrustedNotes } = useUserTrust()
  const { showKinds } = useKindFilter()
  const { settings: feedSettings, updateSettings } = useFeed()

  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)

  const [userFilter, setUserFilter] = useState('')
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const noteListRef = useRef<TNoteListRef | TGroupedNoteListRef>(null)

  return (
    <>
      <Tabs
        value={feedSettings.grouped ? 'grouped' : 'feed'}
        tabs={[
          { value: 'grouped', label: 'Grouped' },
          { value: 'feed', label: 'Feed' }
        ]}
        onTabChange={(tabValue: string) => {
          if (tabValue === 'grouped') {
            // enable grouped mode
            updateSettings({ ...feedSettings, grouped: true })
          } else {
            // disable grouped mode, switch to feed
            updateSettings({ ...feedSettings, grouped: false })
          }
          noteListRef.current?.scrollToTop('smooth')
        }}
        options={
          <>
            {feedSettings.grouped && (
              <>
                <span className="hidden lg:block pl-2">
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
                </span>

                <Input
                  type="text"
                  placeholder={t('GroupedNotesFilter')}
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  showClearButton={true}
                  onClear={() => setUserFilter('')}
                  className="h-9 shadow-none max-w-36 border-none bg-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
                />
              </>
            )}
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter
              showKinds={temporaryShowKinds}
              onShowKindsChange={(newShowKinds: number[]) => {
                setTemporaryShowKinds(newShowKinds)
                noteListRef.current?.scrollToTop()
              }}
            />
            <SettingsMenu noteListRef={noteListRef} />
          </>
        }
      />
      {feedSettings.grouped ? (
        <GroupedNoteList
          ref={noteListRef as React.Ref<TGroupedNoteListRef>}
          showKinds={temporaryShowKinds}
          subRequests={subRequests}
          showRelayCloseReason={showRelayCloseReason}
          userFilter={userFilter}
        />
      ) : (
        <NoteList
          ref={noteListRef as React.Ref<TNoteListRef>}
          showKinds={temporaryShowKinds}
          subRequests={subRequests}
          hideReplies={!feedSettings.includeReplies}
          hideUntrustedNotes={hideUntrustedNotes}
          showRelayCloseReason={showRelayCloseReason}
        />
      )}
    </>
  )
}
