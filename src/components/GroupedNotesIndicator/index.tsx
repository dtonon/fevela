import { Button } from '@/components/ui/button'
import { toProfile } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { Event } from 'nostr-tools'
import { useTranslation } from 'react-i18next'

export default function GroupedNotesIndicator({
  event,
  totalNotesInTimeframe,
  oldestTimestamp,
  className = ''
}: {
  event: Event
  totalNotesInTimeframe: number
  oldestTimestamp?: number
  className?: string
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()

  if (totalNotesInTimeframe <= 1) {
    return null
  }

  const otherNotesCount = totalNotesInTimeframe - 1

  return (
    <div className={`${className} border-t border-border/50`}>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-center text-base text-primary hover:text-foreground py-2 h-auto"
        onClick={(e) => {
          e.stopPropagation()
          push(toProfile(event.pubkey, { hideTopSection: true, since: oldestTimestamp, fromGrouped: true }))
        }}
      >
        {otherNotesCount === 1
          ? t('{{count}} other note from the same user', { count: otherNotesCount })
          : t('{{count}} other notes from the same user', { count: otherNotesCount })}
      </Button>
    </div>
  )
}
