import PostEditor from '@/components/PostEditor'
import { Button } from '@/components/ui/button'
import { usePending } from '@/providers/PendingProvider'
import client from '@/services/client.service'
import { PencilLine } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function PendingNoteActions({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { pendingIds, savePendingEvent, discardPendingEvent } = usePending()
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  if (!pendingIds.includes(event.id)) {
    return null
  }

  const publish = () => {
    if (isPublishing) return
    setIsPublishing(true)
    const promise = (async () => {
      const relays = await client.determineTargetRelays(event)
      await client.publishEvent(relays, event)
      discardPendingEvent(event.id)
    })().finally(() => setIsPublishing(false))
    toast.promise(promise, {
      loading: t('Publishing...'),
      success: () => t('Post successful'),
      error: (err) => {
        savePendingEvent(event)
        return t('Failed to post') + ': ' + err.message
      }
    })
  }

  return (
    <div className="flex gap-2 mb-3">
      <Button variant="secondary" className="flex-1" onClick={() => setIsEditorOpen(true)}>
        <PencilLine />
        {t('Edit note')}
      </Button>
      <Button className="flex-1" disabled={isPublishing} onClick={publish}>
        {t('Publish note')}
      </Button>
      <PostEditor
        defaultContent={event.content}
        editingEvent={event}
        open={isEditorOpen}
        setOpen={setIsEditorOpen}
      />
    </div>
  )
}
