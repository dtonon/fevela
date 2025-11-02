import { useTranslatedEvent } from '@/hooks'
import { getEmojiInfosFromEmojiTags } from '@/lib/tag'
import { Event } from '@nostr/tools/pure'
import { useMemo } from 'react'
import Content from './Content'

export default function NormalContentPreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const translatedEvent = useTranslatedEvent(event?.id)
  const emojiInfos = useMemo(() => getEmojiInfosFromEmojiTags(event?.tags), [event])

  return (
    <Content
      content={translatedEvent?.content ?? event.content}
      className={className}
      emojiInfos={emojiInfos}
    />
  )
}
