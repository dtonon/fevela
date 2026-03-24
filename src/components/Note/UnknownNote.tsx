import { Button } from '@/components/ui/button'
import { getKindDescription } from '@/lib/nostr-kinds-registry'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ClientSelect from '../ClientSelect'
import RawEventDialog from '../NoteOptions/RawEventDialog'

export default function UnknownNote({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const [kindDescription, setKindDescription] = useState(`Kind ${event.kind}`)
  const [isRawEventDialogOpen, setIsRawEventDialogOpen] = useState(false)

  useEffect(() => {
    let isActive = true
    setKindDescription(`Kind ${event.kind}`)
    getKindDescription(event.kind)
      .then((description) => {
        if (isActive) {
          setKindDescription(description)
        }
      })
      .catch(() => undefined)
    return () => {
      isActive = false
    }
  }, [event.kind])

  return (
    <div
      className={cn(
        'flex flex-col gap-2 items-center text-muted-foreground font-medium my-4',
        className
      )}
    >
      <div>{kindDescription}</div>
      <div className="flex flex-col gap-2">
        <ClientSelect event={event} />
        <Button variant="outline" onClick={() => setIsRawEventDialogOpen(true)}>
          {t('View raw event')}
        </Button>
      </div>
      <RawEventDialog
        event={event}
        isOpen={isRawEventDialogOpen}
        onClose={() => setIsRawEventDialogOpen(false)}
      />
    </div>
  )
}
