import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { usePending } from '@/providers/PendingProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import client from '@/services/client.service'
import { Event } from '@nostr/tools/wasm'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function DiscardNoteDialog({
  event,
  open,
  setOpen,
  onDiscarded
}: {
  event: Event
  open: boolean
  setOpen: (open: boolean) => void
  onDiscarded?: () => void
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { discardPendingEvent } = usePending()
  const { addDeletedEvent } = useDeletedEvent()

  const discard = () => {
    client.removeEventFromCache(event.id)
    discardPendingEvent(event.id)
    addDeletedEvent(event)
    setOpen(false)
    toast.success(t('Discarded'))
    onDiscarded?.()
  }

  if (isSmallScreen) {
    return (
      <Drawer defaultOpen={false} open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('Discard note')}</DrawerTitle>
            <DrawerDescription>
              {t('Are you sure you want to discard this note?')}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full">
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={discard} className="w-full">
              {t('Discard')}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <AlertDialog defaultOpen={false} open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Discard note')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Are you sure you want to discard this note?')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={discard}>
            {t('Discard')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
