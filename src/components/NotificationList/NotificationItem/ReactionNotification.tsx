import { useFetchEvent } from '@/hooks'
import { generateBech32IdFromATag, generateBech32IdFromETag, tagNameEquals } from '@/lib/tag'
import { Heart } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Notification from './Notification'

export function ReactionNotification({
  notification,
  isNew = false
}: {
  notification: Event
  isNew?: boolean
}) {
  const { t } = useTranslation()
  const eventId = useMemo(() => {
    const aTag = notification.tags.findLast(tagNameEquals('a'))
    if (aTag) {
      return generateBech32IdFromATag(aTag)
    }
    const eTag = notification.tags.findLast(tagNameEquals('e'))
    return eTag ? generateBech32IdFromETag(eTag) : undefined
  }, [notification])
  const { event } = useFetchEvent(eventId)
  const reaction = useMemo(() => <Heart size={24} className="text-red-400" />, [])

  if (!event || !eventId) {
    return null
  }

  return (
    <Notification
      notificationId={notification.id}
      icon={<div className="text-xl min-w-6 text-center">{reaction}</div>}
      sender={notification.pubkey}
      sentAt={notification.created_at}
      targetEvent={event}
      description={t('reacted to your note')}
      isNew={isNew}
    />
  )
}
