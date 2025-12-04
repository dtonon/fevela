import { useTranslatedEvent } from '@/hooks'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'
import { useTranslation } from 'react-i18next'
import Content from './Content'

export default function PollPreview({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const translatedEvent = useTranslatedEvent(event.id)

  return (
    <div className={cn('pointer-events-none', className)}>
      [{t('Poll')}] <Content event={translatedEvent ?? event} className="italic pr-0.5" />
    </div>
  )
}
