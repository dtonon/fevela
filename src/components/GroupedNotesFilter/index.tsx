import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTrigger } from '@/components/ui/drawer'
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
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Group } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function GroupedNotesFilter() {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { settings, updateSettings, resetSettings, timeFrameOptions } = useGroupedNotes()
  const [open, setOpen] = useState(false)
  const [tempSettings, setTempSettings] = useState(settings)

  const handleOpen = () => {
    setTempSettings(settings)
    setOpen(true)
  }

  const handleApply = () => {
    updateSettings(tempSettings)
    setOpen(false)
  }

  const handleReset = () => {
    resetSettings()
    setTempSettings({
      enabled: false,
      timeFrame: timeFrameOptions[23],
      maxNotesFilter: 0,
      compactedView: false
    })
  }

  const trigger = (
    <Button
      variant="ghost"
      size="titlebar-icon"
      className={cn(
        'relative w-fit px-3 focus:text-foreground',
        !settings.enabled && 'text-muted-foreground'
      )}
      onClick={() => {
        if (isSmallScreen) {
          handleOpen()
        }
      }}
    >
      <Group size={16} />
      {t('Grouped')}
      {settings.enabled && (
        <div className="absolute size-2 rounded-full bg-primary left-7 top-2 ring-2 ring-background" />
      )}
    </Button>
  )

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-b-2 pb-4">
        <Label htmlFor="grouped-mode" className="text-sm font-medium">
          {t('GroupedNotesEnable')}
        </Label>
        <Switch
          id="grouped-mode"
          checked={tempSettings.enabled}
          onCheckedChange={(checked) => setTempSettings((prev) => ({ ...prev, enabled: checked }))}
        />
      </div>

      {tempSettings.enabled && (
        <>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="compacted-view" className="text-sm font-medium">
              {t('GroupedNotesCompact')}
            </Label>
            <Switch
              id="compacted-view"
              checked={tempSettings.compactedView}
              onCheckedChange={(checked) =>
                setTempSettings((prev) => ({ ...prev, compactedView: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium leading-4">{t('GroupedNotesTimeframe')}</Label>
            <Select
              value={`${tempSettings.timeFrame.value}-${tempSettings.timeFrame.unit}`}
              onValueChange={(value) => {
                const [val, unit] = value.split('-')
                const timeFrame = timeFrameOptions.find(
                  (tf) => tf.value === parseInt(val) && tf.unit === unit
                )
                if (timeFrame) {
                  setTempSettings((prev) => ({ ...prev, timeFrame }))
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
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={handleReset} className="flex-1">
          {t('Reset')}
        </Button>
        <Button onClick={handleApply} className="flex-1">
          {t('Apply')}
        </Button>
      </div>
    </div>
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
}
