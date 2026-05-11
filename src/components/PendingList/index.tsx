import ContentPreview from '@/components/ContentPreview'
import { FormattedTimestamp } from '@/components/FormattedTimestamp'
import UserAvatar from '@/components/UserAvatar'
import { toNote } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import client from '@/services/client.service'
import { useState, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { usePending } from '@/providers/PendingProvider'

export type TPendingListRef = {
  publishAll: () => Promise<void>
  hasItems: boolean
  isPublishingAll: boolean
}

const PendingList = forwardRef<TPendingListRef>((_, ref) => {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { pendingEvents, discardPendingEvent, savePendingEvent } = usePending()
  const [isPublishingAll, setIsPublishingAll] = useState(false)

  async function publishAll() {
    if (pendingEvents.length === 0 || isPublishingAll) return

    setIsPublishingAll(true)

    let successCount = 0
    const errors: string[] = []

    for (const event of pendingEvents) {
      try {
        const relayUrls = await client.determineTargetRelays(event)
        await client.publishEvent(relayUrls, event)
        discardPendingEvent(event.id)
        successCount++
      } catch (error) {
        savePendingEvent(event)
        const eventErrors = error instanceof AggregateError ? error.errors : [error]
        errors.push(...eventErrors.map((err) => (err instanceof Error ? err.message : String(err))))
      }
    }

    if (successCount > 0) {
      toast.success(t('Published {{count}} pending items', { count: successCount }), {
        duration: 4000
      })
    }

    if (errors.length > 0) {
      toast.error(`${t('Failed to post')}: ${errors[0]}`, { duration: 10_000 })
    }

    setIsPublishingAll(false)
  }

  useImperativeHandle(ref, () => ({
    publishAll,
    hasItems: pendingEvents.length > 0,
    isPublishingAll
  }))

  if (pendingEvents.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">{t('No pending items')}</div>
    )
  }

  return (
    <div className="pt-2">
      {pendingEvents.map((event) => (
        <button
          key={event.id}
          className="flex items-center justify-between cursor-pointer py-2 px-4 w-full text-left hover:bg-muted/40 transition-colors"
          onClick={() => push(toNote(event))}
        >
          <div className="flex gap-2 items-center flex-1 w-0">
            <UserAvatar userId={event.pubkey} size="small" />
            <ContentPreview className="truncate flex-1 w-0 text-muted-foreground" event={event} />
          </div>
          <div className="text-muted-foreground shrink-0">
            <FormattedTimestamp timestamp={event.created_at} short />
          </div>
        </button>
      ))}
    </div>
  )
})

PendingList.displayName = 'PendingList'

export default PendingList
