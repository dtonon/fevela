import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools'
import { useTranslation } from 'react-i18next'

export default function PictureNotePreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('pointer-events-none', className)}>
      [{t('Image')}] <span className="italic pr-0.5">{event.content}</span>
    </div>
  )
}
