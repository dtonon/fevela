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
import { usePendingPublishMap } from '@/lib/pendingPublish'
import { usePending } from '@/providers/PendingProvider'
import { CloudUpload, Server, Trash2, TriangleAlert } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import RelayIcon from '../RelayIcon'
import { isLocal } from '@nostr/gadgets/redstore'
import { cn } from '@/lib/utils'
import LocalDatabaseMenuButton from './LocalDatabaseMenuButton'

export default function SeenOnButton({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { push } = useSecondaryPage()
  const { pendingIds, discardPendingEvent, savePendingEvent } = usePending()
  const pendingPublishMap = usePendingPublishMap()
  const [relays, setRelays] = useState<string[]>([])
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isEventLocal, setIsEventLocal] = useState(() => isLocal(event))
  const [isRepublishing, setIsRepublishing] = useState(false)

  const isPending = useMemo(
    () => pendingIds.includes(event.id) || pendingPublishMap.has(event.id),
    [pendingIds, pendingPublishMap, event.id]
  )

  useEffect(() => {
    const seenOn = client.getSeenEventRelayUrls(event.id, event)
    setRelays(seenOn)
  }, [event.id, event])

  const republish = async () => {
    if (isRepublishing) return

    setIsRepublishing(true)
    try {
      const relayUrls = await client.determineTargetRelays(event)
      await client.publishEvent(relayUrls, event)
      discardPendingEvent(event.id)
      toast.success(t('Post successful'), { duration: 2000 })
      const seenOn = client.getSeenEventRelayUrls(event.id, event)
      setRelays(seenOn)
    } catch (error) {
      savePendingEvent(event)
      toast.error(t('Saved as pending'))
      const errors = error instanceof AggregateError ? error.errors : [error]
      errors.forEach((err) => {
        toast.error(`${t('Failed to post')}: ${err instanceof Error ? err.message : String(err)}`, {
          duration: 10_000
        })
      })
    } finally {
      setIsRepublishing(false)
      setIsDrawerOpen(false)
    }
  }

  const discard = () => {
    client.removeEventFromCache(event.id)
    discardPendingEvent(event.id)
    setIsDrawerOpen(false)
    toast.success(t('Discarded'))
  }

  const trigger = (
    <button
      className={cn(
        'flex gap-1 items-center text-muted-foreground enabled:hover:text-primary pl-3 h-full',
        isPending && 'text-destructive hover:text-destructive'
      )}
      title={isPending ? t('Not published') : t('Seen on')}
      disabled={relays.length === 0 && !isPending}
      onClick={() => {
        if (isSmallScreen) {
          setIsDrawerOpen(true)
        }
      }}
    >
      {isPending ? <TriangleAlert className="animate-pulse" /> : <Server />}
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
              {isPending && (
                <>
                  <div className="px-6 py-4 flex items-center gap-4 text-lg font-medium text-destructive">
                    <TriangleAlert /> {isRepublishing ? t('Publishing...') : t('Not published')}
                  </div>
                  <Button
                    className="w-full p-6 justify-start text-lg gap-4"
                    variant="ghost"
                    onClick={republish}
                    disabled={isRepublishing}
                  >
                    <CloudUpload /> {t('Publish')}
                  </Button>
                  <Button
                    className="w-full p-6 justify-start text-lg gap-4 text-destructive"
                    variant="ghost"
                    onClick={discard}
                  >
                    <Trash2 /> {t('Discard')}
                  </Button>
                </>
              )}
              {!isPending && isEventLocal && (
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
                    }, 50)
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
        {isPending && (
          <>
            <DropdownMenuLabel className="text-destructive flex items-center gap-2">
              <TriangleAlert className="size-4" />
              {isRepublishing ? t('Publishing...') : t('Not published')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={republish} disabled={isRepublishing}>
              <CloudUpload className="size-4" />
              {t('Publish')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={discard}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              {t('Discard')}
            </DropdownMenuItem>
          </>
        )}
        {!isPending && (
          <>
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
