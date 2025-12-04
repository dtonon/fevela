import { useTranslatedEvent } from '@/hooks'
import { Event } from '@nostr/tools/wasm'
import Content from './Content'

export default function NormalContentPreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const translatedEvent = useTranslatedEvent(event?.id)

  return <Content event={translatedEvent ?? event} className={className} />
}
