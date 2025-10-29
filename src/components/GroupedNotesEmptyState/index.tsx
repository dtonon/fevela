import { Button } from '@/components/ui/button'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useTranslation } from 'react-i18next'

export default function GroupedNotesEmptyState({
  onOpenSettings,
  onReset
}: {
  onOpenSettings: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const { settings } = useGroupedNotes()

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-foreground mb-2">
          {t('No notes found with current grouped settings')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t('Try adjusting your timeframe or activity filter to see more results.')}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onOpenSettings}>
          {t('Adjust Settings')}
        </Button>
        <Button onClick={onReset}>
          {t('Reset to Default')}
        </Button>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <p>
          {t('Current settings:')} {settings.timeFrame.label}
          {settings.maxNotesFilter > 0 &&
            `, ${t('max {{count}} notes per user', { count: settings.maxNotesFilter })}`
          }
        </p>
      </div>
    </div>
  )
}