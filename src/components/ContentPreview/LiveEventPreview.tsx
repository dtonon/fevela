import { getLiveEventMetadataFromEvent } from '@/lib/event-metadata'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/pure'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function LiveEventPreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()
  const metadata = useMemo(() => getLiveEventMetadataFromEvent(event), [event])

  return (
    <div className={cn('pointer-events-none', className)}>
      [{t('Live event')}] <span className="italic pr-0.5">{metadata.title}</span>
    </div>
  )
}
