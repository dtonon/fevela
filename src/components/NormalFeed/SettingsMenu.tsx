import { Settings, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTrigger } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { TNoteListRef } from '../NoteList'
import { TGroupedNoteListRef } from '../GroupedNoteList'
import { TFeedSettings, useFeed } from '@/providers/FeedProvider'

export default function SettingsMenu({
  noteListRef
}: {
  noteListRef: React.RefObject<TNoteListRef | TGroupedNoteListRef>
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { settings, updateSettings, resetSettings, timeFrameOptions } = useFeed()
  const [open, setOpen] = useState(false)
  const { settings: feedSettings } = useFeed()
  const [tempSettings, setTempSettings] = useState(prepare(settings))

  const trigger = (
    <Button
      variant="ghost"
      size="titlebar-icon"
      className={cn(
        'relative w-fit px-3 focus:text-foreground',
        !settings.grouped && 'text-muted-foreground'
      )}
      onClick={() => {
        if (isSmallScreen) {
          handleOpen()
        }
      }}
    >
      <Settings size={16} className="text-muted-foreground" />
    </Button>
  )

  const content = (
    <>
      {feedSettings.grouped ? (
        <div className="space-y-4 mb-4">
          <>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-medium leading-4">{t('GroupedNotesTimeframe')}</Label>
              <Select
                value={`${tempSettings.groupedTimeframe.value}-${tempSettings.groupedTimeframe.unit}`}
                onValueChange={(value) => {
                  const [val, unit] = value.split('-')
                  const groupedTimeframe = timeFrameOptions.find(
                    (tf) => tf.value === parseInt(val) && tf.unit === unit
                  )
                  if (groupedTimeframe) {
                    setTempSettings((prev) => ({ ...prev, groupedTimeframe }))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeFrameOptions.map((tf) => (
                    <SelectItem key={`${tf.value}-${tf.unit}`} value={`${tf.value}-${tf.unit}`}>
                      {`${tf.value} ${t(tf.label)}`}
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
                checked={tempSettings.groupedCompactedView}
                onCheckedChange={(checked) =>
                  setTempSettings((prev) => ({ ...prev, groupedCompactedView: checked }))
                }
              />
            </div>

            {tempSettings.groupedCompactedView && (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-preview" className="text-sm font-medium">
                  {t('GroupedNotesShowPreview')}
                </Label>
                <Switch
                  id="show-preview"
                  checked={tempSettings.groupedShowPreview}
                  onCheckedChange={(checked) =>
                    setTempSettings((prev) => ({ ...prev, groupedShowPreview: checked }))
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <Label
                htmlFor="sort-by-relevance"
                className="text-sm font-medium flex items-center gap-1"
              >
                {t('GroupedNotesSortByRelevance')}
                <Sparkles size={14} className="text-primary" />
              </Label>
              <Switch
                id="sort-by-relevance"
                checked={tempSettings.groupedSortByRelevance}
                onCheckedChange={(checked) =>
                  setTempSettings((prev) => ({ ...prev, groupedSortByRelevance: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium leading-4">{t('GroupedNotesFilterMore')}</Label>
              <Select
                value={tempSettings.maxNotesFilter.toString()}
                onValueChange={(value) =>
                  setTempSettings((prev) => ({ ...prev, maxNotesFilter: parseInt(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="0">{t('GroupedNotesDisabled')}</SelectItem>
                  {Array.from({ length: 100 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {i + 1} {i + 1 === 1 ? t('note') : t('notes')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        </div>
      ) : (
        <></>
      )}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="include-replies" className="text-sm font-medium">
            {t('GroupedNotesIncludeReplies')}
          </Label>
          <Switch
            id="include-replies"
            checked={tempSettings.includeReplies}
            onCheckedChange={(checked: boolean) =>
              setTempSettings((prev) => ({ ...prev, includeReplies: checked }))
            }
          />
        </div>

        {tempSettings.includeReplies && (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="show-only-first-level-replies" className="text-sm font-medium">
              {t('GroupedNotesShowOnlyFirstLevelReplies')}
            </Label>
            <Switch
              id="show-only-first-level-replies"
              checked={tempSettings.showOnlyFirstLevelReplies}
              onCheckedChange={(checked) =>
                setTempSettings((prev) => ({ ...prev, showOnlyFirstLevelReplies: checked }))
              }
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="hide-short-notes" className="text-sm font-medium">
            {t('GroupedNotesHideShortNotes')}
          </Label>
          <Switch
            id="hide-short-notes"
            checked={tempSettings.hideShortNotes}
            onCheckedChange={(checked) =>
              setTempSettings((prev) => ({ ...prev, hideShortNotes: checked }))
            }
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
              value={tempSettings.wordFilter}
              onChange={(e) =>
                setTempSettings((prev) => ({
                  ...prev,
                  wordFilter: e.target.value
                }))
              }
              showClearButton
              onClear={() => setTempSettings((prev) => ({ ...prev, wordFilter: '' }))}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            setTempSettings(prepare(resetSettings()))
          }}
          className="flex-1"
        >
          {t('Reset')}
        </Button>
        <Button
          onClick={() => {
            updateSettings({
              ...tempSettings,
              wordFilter: tempSettings.wordFilter
                .toLowerCase()
                .split(' ')
                .flatMap((v) => v.split(','))
                .map((v) => v.trim())
                .filter((v) => v)
            })
            if (!feedSettings.grouped) {
              noteListRef?.current?.scrollToTop()
            }
            setOpen(false)
          }}
          className="flex-1"
        >
          {t('Apply')}
        </Button>
      </div>
    </>
  )

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild></DrawerTrigger>
          <DrawerContent className="px-4">
            <DrawerHeader />
            {content}
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={handleOpen}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80" collisionPadding={16} sideOffset={0}>
        {content}
      </PopoverContent>
    </Popover>
  )

  function handleOpen() {
    setTempSettings(prepare(settings))
    setOpen(true)
  }

  function prepare(
    settings: TFeedSettings
  ): Omit<TFeedSettings, 'wordFilter'> & { wordFilter: string } {
    return {
      ...settings,
      wordFilter: [...settings.wordFilter, ''].join(', ')
    }
  }
}
