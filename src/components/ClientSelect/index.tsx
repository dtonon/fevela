import { Button, ButtonProps } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerOverlay, DrawerTrigger } from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { getNoteBech32Id } from '@/lib/event'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { ExternalLink } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import * as nip19 from '@nostr/tools/nip19'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function ClientSelect({
  event,
  originalNoteId,
  ...props
}: ButtonProps & {
  event?: Event
  originalNoteId?: string
}) {
  const { isSmallScreen } = useScreenSize()
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const supportedClients = useMemo(() => {
    let kind: number | undefined
    if (event) {
      kind = event.kind
    } else if (originalNoteId) {
      try {
        const pointer = nip19.decode(originalNoteId)
        if (pointer.type === 'naddr') {
          kind = pointer.data.kind
        } else if (pointer.type === 'nevent') {
          kind = pointer.data.kind
        }
      } catch (error) {
        console.error('Failed to decode NIP-19 pointer:', error)
      }
    }

    const handlerRegistry = window.fevela?.universe?.clientHandlers
    const fallbackHandlers = handlerRegistry?.fallback ?? []
    const kindHandlers = handlerRegistry?.byKind?.[kind!] ?? []
    return [...kindHandlers, ...fallbackHandlers]
  }, [event, originalNoteId])

  if (!originalNoteId && !event) {
    return null
  }

  const content = (
    <div className="space-y-2">
      {supportedClients.map((client) => (
        <ClientSelectItem
          key={client.name}
          onClick={() => setOpen(false)}
          href={client.urlPattern.replace('{}', originalNoteId ?? getNoteBech32Id(event!))}
          name={client.name}
        />
      ))}
      <Separator />
      <Button
        variant="ghost"
        className="w-full py-6 font-semibold"
        onClick={() => {
          navigator.clipboard.writeText(originalNoteId ?? getNoteBech32Id(event!))
          setOpen(false)
        }}
      >
        {t('Copy event ID')}
      </Button>
    </div>
  )

  const trigger = (
    <Button variant="outline" {...props}>
      <ExternalLink /> {t('Open in another client')}
    </Button>
  )

  if (isSmallScreen) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerOverlay
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <DrawerContent hideOverlay>{content}</DrawerContent>
        </Drawer>
      </div>
    )
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="px-8" onOpenAutoFocus={(e) => e.preventDefault()}>
          {content}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ClientSelectItem({
  onClick,
  href,
  name
}: {
  onClick: () => void
  href: string
  name: string
}) {
  return (
    <Button asChild variant="ghost" className="w-full py-6 font-semibold" onClick={onClick}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        {name}
      </a>
    </Button>
  )
}
