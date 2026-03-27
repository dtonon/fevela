import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { isProtectedEvent } from '@/lib/event'
import { simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import client from '@/services/client.service'
import { Check } from 'lucide-react'
import { NostrEvent } from '@nostr/tools/wasm'
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RelayIcon from '../RelayIcon'

type TPostTargetItem =
  | {
      type: 'ourWriteRelays'
    }
  | {
      type: 'theirReadRelays'
    }
  | {
      type: 'relay'
      url: string
    }
  | {
      type: 'relaySet'
      id: string
      urls: string[]
    }

export default function PostRelaySelector({
  children,
  parentEvent,
  openFrom,
  setIsProtectedEvent,
  setAdditionalRelayUrls,
  setIncludeOurWriteRelays,
  setIncludeTheirReadRelays
}: {
  children?: React.ReactNode
  parentEvent?: NostrEvent
  openFrom?: string[]
  setAdditionalRelayUrls: Dispatch<SetStateAction<string[]>>
  setIsProtectedEvent?: Dispatch<SetStateAction<boolean>>
  setIncludeOurWriteRelays?: Dispatch<SetStateAction<boolean>>
  setIncludeTheirReadRelays?: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { relayUrls } = useCurrentRelays()
  const { relaySets, urls } = useFavoriteRelays()
  const [postTargetItems, setPostTargetItems] = useState<TPostTargetItem[]>([])

  const parentEventSeenOnRelays = useMemo(() => {
    if (!parentEvent || !isProtectedEvent(parentEvent)) {
      return []
    }
    return client.getSeenEventRelayUrls(parentEvent.id, parentEvent)
  }, [parentEvent])

  const selectableRelays = useMemo(() => {
    return Array.from(new Set(parentEventSeenOnRelays.concat(relayUrls).concat(urls)))
  }, [parentEventSeenOnRelays, relayUrls, urls])

  const description = useMemo(() => {
    if (postTargetItems.length === 0) {
      return t('No relays selected')
    }
    if (postTargetItems.length === 1) {
      const item = postTargetItems[0]
      if (item.type === 'ourWriteRelays') {
        return t('Our write relays')
      }
      if (item.type === 'theirReadRelays') {
        return t('Their read relays')
      }
      if (item.type === 'relay') {
        return simplifyUrl(item.url)
      }
      if (item.type === 'relaySet') {
        return item.urls.length > 1
          ? t('{{count}} relays', { count: item.urls.length })
          : simplifyUrl(item.urls[0])
      }
    }
    const hasOurWriteRelays = postTargetItems.some((item) => item.type === 'ourWriteRelays')
    const hasTheirReadRelays = postTargetItems.some((item) => item.type === 'theirReadRelays')
    const relayCount = postTargetItems.reduce((count, item) => {
      if (item.type === 'relay') {
        return count + 1
      }
      if (item.type === 'relaySet') {
        return count + item.urls.length
      }
      return count
    }, 0)
    if (hasOurWriteRelays && hasTheirReadRelays) {
      return relayCount > 0
        ? t('Our write relays, their read relays and {{count}} other relays', { count: relayCount })
        : t('Our write relays and their read relays')
    }
    if (hasOurWriteRelays) {
      return relayCount > 0
        ? t('Our write relays and {{count}} other relays', { count: relayCount })
        : t('Our write relays')
    }
    if (hasTheirReadRelays) {
      return relayCount > 0
        ? t('Their read relays and {{count}} other relays', { count: relayCount })
        : t('Their read relays')
    }
    return t('{{count}} relays', { count: relayCount })
  }, [postTargetItems, t])

  useEffect(() => {
    if (openFrom && openFrom.length) {
      setPostTargetItems(Array.from(new Set(openFrom)).map((url) => ({ type: 'relay', url })))
      return
    }
    if (parentEventSeenOnRelays && parentEventSeenOnRelays.length) {
      setPostTargetItems(parentEventSeenOnRelays.map((url) => ({ type: 'relay', url })))
      return
    }
    setPostTargetItems([{ type: 'ourWriteRelays' }, { type: 'theirReadRelays' }])
  }, [openFrom, parentEventSeenOnRelays])

  useEffect(() => {
    const includeOurWriteRelays = postTargetItems.some((item) => item.type === 'ourWriteRelays')
    const includeTheirReadRelays = postTargetItems.some((item) => item.type === 'theirReadRelays')
    const isProtectedEvent = !includeOurWriteRelays && !includeTheirReadRelays
    const relayUrls = postTargetItems.flatMap((item) => {
      if (item.type === 'relay') {
        return [item.url]
      }
      if (item.type === 'relaySet') {
        return item.urls
      }
      return []
    })

    setIsProtectedEvent?.(isProtectedEvent)
    setAdditionalRelayUrls(relayUrls)
    setIncludeOurWriteRelays?.(includeOurWriteRelays)
    setIncludeTheirReadRelays?.(includeTheirReadRelays)
  }, [
    postTargetItems,
    setAdditionalRelayUrls,
    setIncludeOurWriteRelays,
    setIncludeTheirReadRelays,
    setIsProtectedEvent
  ])

  const handleOurWriteRelaysCheckedChange = useCallback((checked: boolean) => {
    if (checked) {
      setPostTargetItems((prev) => [...prev, { type: 'ourWriteRelays' }])
    } else {
      setPostTargetItems((prev) => prev.filter((item) => item.type !== 'ourWriteRelays'))
    }
  }, [])

  const handleTheirReadRelaysCheckedChange = useCallback((checked: boolean) => {
    if (checked) {
      setPostTargetItems((prev) => [...prev, { type: 'theirReadRelays' }])
    } else {
      setPostTargetItems((prev) => prev.filter((item) => item.type !== 'theirReadRelays'))
    }
  }, [])

  const handleRelayCheckedChange = useCallback((checked: boolean, url: string) => {
    if (checked) {
      setPostTargetItems((prev) => [...prev, { type: 'relay', url }])
    } else {
      setPostTargetItems((prev) =>
        prev.filter((item) => !(item.type === 'relay' && item.url === url))
      )
    }
  }, [])

  const handleRelaySetCheckedChange = useCallback(
    (checked: boolean, id: string, urls: string[]) => {
      if (checked) {
        setPostTargetItems((prev) => [...prev, { type: 'relaySet', id, urls }])
      } else {
        setPostTargetItems((prev) =>
          prev.filter((item) => !(item.type === 'relaySet' && item.id === id))
        )
      }
    },
    []
  )

  const content = useMemo(() => {
    return (
      <>
        {setIncludeOurWriteRelays && (
          <MenuItem
            checked={postTargetItems.some((item) => item.type === 'ourWriteRelays')}
            onCheckedChange={handleOurWriteRelaysCheckedChange}
          >
            {t('Our write relays')}
          </MenuItem>
        )}
        {setIncludeTheirReadRelays && (
          <MenuItem
            checked={postTargetItems.some((item) => item.type === 'theirReadRelays')}
            onCheckedChange={handleTheirReadRelaysCheckedChange}
          >
            {t('Their read relays')}
          </MenuItem>
        )}
        {relaySets.length > 0 && (
          <>
            <MenuSeparator />
            {relaySets
              .filter(({ relayUrls }) => relayUrls.length)
              .map(({ id, name, relayUrls }) => (
                <MenuItem
                  key={id}
                  checked={postTargetItems.some(
                    (item) => item.type === 'relaySet' && item.id === id
                  )}
                  onCheckedChange={(checked) => handleRelaySetCheckedChange(checked, id, relayUrls)}
                >
                  <div className="truncate">
                    {name} ({relayUrls.length})
                  </div>
                </MenuItem>
              ))}
          </>
        )}
        {selectableRelays.length > 0 && (
          <>
            <MenuSeparator />
            {selectableRelays.map((url) => (
              <MenuItem
                key={url}
                checked={postTargetItems.some((item) => item.type === 'relay' && item.url === url)}
                onCheckedChange={(checked) => handleRelayCheckedChange(checked, url)}
              >
                <div className="flex items-center gap-2">
                  <RelayIcon url={url} />
                  <div className="truncate">{simplifyUrl(url)}</div>
                </div>
              </MenuItem>
            ))}
          </>
        )}
      </>
    )
  }, [postTargetItems, relaySets, selectableRelays])

  const triggerContent = children || (
    <div className="flex items-center gap-2">
      {t('Post to')}
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="px-2 flex-1 max-w-fit justify-start">
          <div className="truncate">{description}</div>
        </Button>
      </DropdownMenuTrigger>
    </div>
  )

  if (isSmallScreen) {
    return (
      <>
        {triggerContent}
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerOverlay onClick={() => setIsDrawerOpen(false)} />
          <DrawerContent className="max-h-[80vh]" hideOverlay>
            <div
              className="overflow-y-auto overscroll-contain py-2"
              style={{ touchAction: 'pan-y' }}
            >
              {content}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu>
      {triggerContent}
      <DropdownMenuContent align="start" className="max-w-96 max-h-[50vh]" showScrollButtons>
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuSeparator() {
  const { isSmallScreen } = useScreenSize()
  if (isSmallScreen) {
    return <Separator />
  }
  return <DropdownMenuSeparator />
}

function MenuItem({
  children,
  checked,
  onCheckedChange
}: {
  children: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const { isSmallScreen } = useScreenSize()

  if (isSmallScreen) {
    return (
      <div
        onClick={() => onCheckedChange(!checked)}
        className="flex items-center gap-2 px-4 py-3 clickable"
      >
        <div className="flex items-center justify-center size-4 shrink-0">
          {checked && <Check className="size-4" />}
        </div>
        {children}
      </div>
    )
  }

  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={onCheckedChange}
      className="flex items-center gap-2"
    >
      {children}
    </DropdownMenuCheckboxItem>
  )
}
