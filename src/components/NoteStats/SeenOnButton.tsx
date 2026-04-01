import { useSecondaryPage } from '@/PageManager'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { toRelay } from '@/lib/link'
import { simplifyUrl } from '@/lib/url'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import client from '@/services/client.service'
import { Server } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RelayIcon from '../RelayIcon'
import { isLocal } from '@nostr/gadgets/redstore'
import LocalDatabaseMenuButton from './LocalDatabaseMenuButton'

export default function SeenOnButton({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { push } = useSecondaryPage()
  const [relays, setRelays] = useState<string[]>([])
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isEventLocal, setIsEventLocal] = useState(() => isLocal(event))

  useEffect(() => {
    const seenOn = client.getSeenEventRelayUrls(event.id, event)
    setRelays(seenOn)
  }, [])

  const trigger = (
    <button
      className="flex gap-1 items-center text-muted-foreground enabled:hover:text-primary pl-3 h-full"
      title={t('Seen on')}
      disabled={relays.length === 0}
      onClick={() => {
        if (isSmallScreen) {
          setIsDrawerOpen(true)
        }
      }}
    >
      <Server />
      {relays.length > 0 && <div className="text-sm">{relays.length}</div>}
    </button>
  )

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerOverlay onClick={() => setIsDrawerOpen(false)} />
          <DrawerContent hideOverlay>
            <div className="py-2">
              {isEventLocal && (
                <LocalDatabaseMenuButton
                  event={event}
                  is={isEventLocal}
                  mode="drawer"
                  onAction={() => {
                    setIsEventLocal(false)
                  }}
                />
              )}
              {relays.map((relay) => (
                <Button
                  className="w-full p-6 justify-start text-lg gap-4"
                  variant="ghost"
                  key={relay}
                  onClick={() => {
                    setIsDrawerOpen(false)
                    setTimeout(() => {
                      push(toRelay(relay))
                    }, 50) // Timeout to allow the drawer to close before navigating
                  }}
                >
                  <RelayIcon url={relay} /> {simplifyUrl(relay)}
                </Button>
              ))}
              {!isEventLocal && (
                <>
                  <div className="px-6 pt-2 pb-1 text-sm font-medium text-muted-foreground">
                    {t('Not on')}
                  </div>
                  <LocalDatabaseMenuButton
                    event={event}
                    is={isEventLocal}
                    mode="drawer"
                    onAction={() => {
                      setIsEventLocal(true)
                    }}
                  />
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('Seen on')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isEventLocal && (
          <LocalDatabaseMenuButton
            event={event}
            is={isEventLocal}
            mode="dropdown"
            onAction={() => setIsEventLocal(false)}
          />
        )}
        {relays.map((relay) => (
          <DropdownMenuItem key={relay} onClick={() => push(toRelay(relay))} className="min-w-52">
            <RelayIcon url={relay} />
            {simplifyUrl(relay)}
          </DropdownMenuItem>
        ))}
        {!isEventLocal && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('Not on')}</DropdownMenuLabel>
            <LocalDatabaseMenuButton
              event={event}
              is={isEventLocal}
              mode="dropdown"
              onAction={() => setIsEventLocal(true)}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
