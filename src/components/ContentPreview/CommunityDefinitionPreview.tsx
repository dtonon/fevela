import { getCommunityDefinitionFromEvent } from '@/lib/event-metadata'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function CommunityDefinitionPreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()
  const metadata = useMemo(() => getCommunityDefinitionFromEvent(event), [event])

  return (
    <div className={cn('pointer-events-none', className)}>
      [{t('Community')}] <span className="italic pr-0.5">{metadata.name}</span>
    </div>
  )
}
