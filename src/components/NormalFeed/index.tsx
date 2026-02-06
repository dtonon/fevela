import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Settings } from 'lucide-react'

import NoteList, { TNoteListRef } from '@/components/NoteList'
import GroupedNoteList, { TGroupedNoteListRef } from '@/components/GroupedNoteList'
import Tabs from '@/components/Tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { TFeedSubRequest } from '@/types'
import KindFilter from '../KindFilter'
import { RefreshButton } from '../RefreshButton'
import storage from '@/services/local-storage.service'

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
  const { settings: groupedNotesSettings } = useGroupedNotes()

  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)

  const [userFilter, setUserFilter] = useState('')
  const [includeReplies, setIncludeReplies] = useState(
    storage.getNoteListMode() === 'postsAndReplies'
  )
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const noteListRef = useRef<TNoteListRef | TGroupedNoteListRef>(null)

  const { updateSettings } = useGroupedNotes()

  const SettingsButton = () => {
    const { settings, timeFrameOptions } = useGroupedNotes()

    const content = groupedNotesSettings.enabled ? (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium leading-4">{t('GroupedNotesTimeframe')}</Label>
          <Select
            value={`${settings.timeFrame.value}-${settings.timeFrame.unit}`}
            onValueChange={(value) => {
              const [val, unit] = value.split('-')
              const timeFrame = timeFrameOptions.find(
                (tf) => tf.value === parseInt(val) && tf.unit === unit
              )
              if (timeFrame) {
                updateSettings({ ...settings, timeFrame })
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {timeFrameOptions.map((tf) => (
                <SelectItem key={`${tf.value}-${tf.unit}`} value={`${tf.value}-${tf.unit}`}>
                  {tf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="compacted-view" className="text-sm font-medium">
            {t('GroupedNotesCompact')}
          </Label>
          <Switch
            id="compacted-view"
            checked={settings.compactedView}
            onCheckedChange={(checked) => {
              updateSettings({ ...settings, compactedView: checked })
            }}
          />
        </div>

        {settings.compactedView && (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="show-preview" className="text-sm font-medium">
              {t('GroupedNotesShowPreview')}
            </Label>
            <Switch
              id="show-preview"
              checked={settings.showPreview}
              onCheckedChange={(checked) => updateSettings({ ...settings, showPreview: checked })}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="include-replies" className="text-sm font-medium">
            {t('GroupedNotesIncludeReplies')}
          </Label>
          <Switch
            id="include-replies"
            checked={settings.includeReplies}
            onCheckedChange={(checked) => {
              storage.setNoteListMode(checked ? 'postsAndReplies' : 'posts')
              setIncludeReplies(checked)
              updateSettings({ ...settings, includeReplies: checked })
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="word-filter" className="text-sm font-medium leading-4">
            {t('GroupedNotesWordFilter')}
          </Label>
          <div className="relative">
            <Input
              id="word-filter"
              type="text"
              placeholder={t('GroupedNotesWordFilterPlaceholder')}
              className="text-[#e03f8c]"
              value={settings.wordFilter}
              onChange={(e) => updateSettings({ ...settings, wordFilter: e.target.value })}
              showClearButton
              onClear={() => updateSettings({ ...settings, wordFilter: '' })}
            />
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="include-replies" className="text-sm font-medium">
            {t('GroupedNotesIncludeReplies')}
          </Label>
          <Switch
            id="include-replies"
            checked={includeReplies}
            onCheckedChange={(checked: boolean) => {
              storage.setNoteListMode(checked ? 'postsAndReplies' : 'posts')
              setIncludeReplies(checked)
              updateSettings({ ...settings, includeReplies: checked })
              noteListRef.current?.scrollToTop()
            }}
          />
        </div>
      </div>
    )

    return (
      <Popover open={settingsMenuOpen} onOpenChange={setSettingsMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="titlebar-icon"
            className="relative w-fit px-3 focus:text-foreground text-muted-foreground"
          >
            {groupedNotesSettings.enabled ? <Group size={16} /> : <Settings size={16} />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" collisionPadding={16} sideOffset={0}>
          {content}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <Tabs
        value={groupedNotesSettings.enabled ? 'grouped' : 'feed'}
        tabs={[
          { value: 'grouped', label: 'Grouped' },
          { value: 'feed', label: 'Feed' }
        ]}
        onTabChange={(tabValue: string) => {
          if (tabValue === 'grouped') {
            // enable grouped mode
            updateSettings({ ...groupedNotesSettings, enabled: true })
          } else {
            // disable grouped mode, switch to feed
            updateSettings({ ...groupedNotesSettings, enabled: false })
          }
          noteListRef.current?.scrollToTop('smooth')
        }}
        options={
          <>
            {groupedNotesSettings.enabled && (
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
            <SettingsButton />
          </>
        }
      />
      {groupedNotesSettings.enabled ? (
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
          hideReplies={!includeReplies}
          hideUntrustedNotes={hideUntrustedNotes}
          showRelayCloseReason={showRelayCloseReason}
        />
      )}
    </>
  )
}
