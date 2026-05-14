import { npubEncode } from '@nostr/tools/nip19'
import { getNoteBech32Id, isProtectedEvent } from '@/lib/event'
import { toNjump } from '@/lib/link'
import { simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { usePinList } from '@/providers/PinListProvider'
import { usePinBury } from '@/providers/PinBuryProvider'
import client from '@/services/client.service'
import {
  Bell,
  BellOff,
  CloudUpload,
  Code,
  Copy,
  FilePen,
  Link,
  Pin,
  PinOff,
  ArrowDown,
  ArrowUp,
  SatelliteDish,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import RelayIcon from '../RelayIcon'
import { useFeed } from '@/providers/FeedProvider'
import { usePending } from '@/providers/PendingProvider'
import { usePendingPublishMap } from '@/lib/pendingPublish'

export interface SubMenuAction {
  label: React.ReactNode
  onClick: () => void
  className?: string
  separator?: boolean
}

export interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick?: () => void
  className?: string
  separator?: boolean
  subMenu?: SubMenuAction[]
  disabled?: boolean
  title?: string
}

interface UseMenuActionsProps {
  event: Event
  closeDrawer: () => void
  openEditor: () => void
  showSubMenuActions: (subMenu: SubMenuAction[], title: string) => void
  setIsRawEventDialogOpen: (open: boolean) => void
  setIsReportDialogOpen: (open: boolean) => void
  isSmallScreen: boolean
}

export function useMenuActions({
  event,
  closeDrawer,
  openEditor,
  showSubMenuActions,
  setIsRawEventDialogOpen,
  setIsReportDialogOpen,
  isSmallScreen
}: UseMenuActionsProps) {
  const { t } = useTranslation()
  const { pubkey, attemptDelete } = useNostr()
  const { relayUrls: currentBrowsingRelayUrls } = useCurrentRelays()
  const { relaySets, urls } = useFavoriteRelays()
  const relayUrls = useMemo(() => {
    return Array.from(new Set(currentBrowsingRelayUrls.concat(urls)))
  }, [currentBrowsingRelayUrls, urls])
  const { mutePublicly, mutePrivately, unmute, mutePubkeySet, supportsEncryption } = useMuteList()
  const { pinList, pin, unpin } = usePinList()
  const { getPinBuryState, setPinned, setBuried, clearState } = usePinBury()
  const { settings: feedSettings } = useFeed()
  const { pendingIds, discardPendingEvent, savePendingEvent } = usePending()
  const pendingPublishMap = usePendingPublishMap()
  const isMuted = useMemo(() => mutePubkeySet.has(event.pubkey), [mutePubkeySet, event])
  const pinBuryState = useMemo(() => getPinBuryState(event.pubkey), [getPinBuryState, event.pubkey])

  const isPending = useMemo(
    () => pendingIds.includes(event.id) || pendingPublishMap.has(event.id),
    [pendingIds, pendingPublishMap, event.id]
  )

  const broadcastSubMenu: SubMenuAction[] = useMemo(() => {
    const items = []
    if (pubkey && event.pubkey === pubkey) {
      items.push({
        label: <div className="text-left"> {t('Write relays')}</div>,
        onClick: async () => {
          closeDrawer()
          const promise = async () => {
            const relays = await client.determineTargetRelays(event)
            if (relays?.length) {
              await client.publishEvent(relays, event)
              discardPendingEvent(event.id)
            }
          }
          toast.promise(promise, {
            loading: t('Publishing...'),
            success: () => {
              return t('Post successful')
            },
            error: (err) => {
              savePendingEvent(event)
              toast.error(t('Saved as pending'))
              return t('Failed to post') + ': ' + err.message
            }
          })
        }
      })
    }

    if (relaySets.length) {
      items.push(
        ...relaySets
          .filter((set) => set.relayUrls.length)
          .map((set, index) => ({
            label: <div className="text-left truncate">{set.name}</div>,
            onClick: async () => {
              closeDrawer()
              const promise = (async () => {
                await client.publishEvent(set.relayUrls, event)
                discardPendingEvent(event.id)
              })()
              toast.promise(promise, {
                loading: t('Publishing...'),
                success: () => {
                  return t('Post successful')
                },
                error: (err) => {
                  savePendingEvent(event)
                  toast.error(t('Saved as pending'))
                  return t('Failed to post') + ': ' + err.message
                }
              })
            },
            separator: index === 0
          }))
      )
    }

    if (relayUrls.length) {
      items.push(
        ...relayUrls.map((relay, index) => ({
          label: (
            <div className="flex items-center gap-2 w-full">
              <RelayIcon url={relay} />
              <div className="flex-1 truncate text-left">{simplifyUrl(relay)}</div>
            </div>
          ),
          onClick: async () => {
            closeDrawer()
            const promise = (async () => {
              await client.publishEvent([relay], event)
              discardPendingEvent(event.id)
            })()
            toast.promise(promise, {
              loading: t('Publishing...'),
              success: () => {
                return t('Post successful')
              },
              error: (err) => {
                savePendingEvent(event)
                toast.error(t('Saved as pending'))
                return t('Failed to post') + ': ' + err.message
              }
            })
          },
          separator: index === 0
        }))
      )
    }

    return items
  }, [pubkey, relayUrls, relaySets, event, t, closeDrawer])

  const menuActions: MenuAction[] = useMemo(() => {
    const actions: MenuAction[] = []

    // Pin/Bury user actions (first block) - only when grouped notes is enabled
    if (feedSettings.grouped) {
      if (pinBuryState === 'pinned') {
        actions.push({
          icon: PinOff,
          label: t('GroupedNotesUnpin'),
          onClick: () => {
            closeDrawer()
            clearState(event.pubkey)
          }
        })
        actions.push({
          icon: ArrowDown,
          label: t('GroupedNotesBury'),
          onClick: () => {
            closeDrawer()
            setBuried(event.pubkey)
          }
        })
      } else if (pinBuryState === 'buried') {
        actions.push({
          icon: ArrowUp,
          label: t('GroupedNotesUnbury'),
          onClick: () => {
            closeDrawer()
            clearState(event.pubkey)
          }
        })
        actions.push({
          icon: Pin,
          label: t('GroupedNotesPin'),
          onClick: () => {
            closeDrawer()
            setPinned(event.pubkey)
          }
        })
      } else {
        actions.push({
          icon: Pin,
          label: t('GroupedNotesPin'),
          onClick: () => {
            closeDrawer()
            setPinned(event.pubkey)
          }
        })
        actions.push({
          icon: ArrowDown,
          label: t('GroupedNotesBury'),
          onClick: () => {
            closeDrawer()
            setBuried(event.pubkey)
          }
        })
      }
    }

    // Standard actions
    actions.push(
      ...([
        {
          icon: Copy,
          label: t('Copy event ID'),
          onClick: () => {
            navigator.clipboard.writeText(getNoteBech32Id(event))
            closeDrawer()
          },
          separator: feedSettings.grouped // Only add separator if pin/bury actions were shown
        },
        {
          icon: Copy,
          label: t('Copy user ID'),
          onClick: () => {
            navigator.clipboard.writeText(npubEncode(event.pubkey) ?? '')
            closeDrawer()
          }
        },
        !isPending && {
          icon: Link,
          label: t('Copy share link'),
          onClick: () => {
            navigator.clipboard.writeText(toNjump(getNoteBech32Id(event)))
            closeDrawer()
          }
        },
        {
          icon: Code,
          label: t('View raw event'),
          onClick: () => {
            closeDrawer()
            setIsRawEventDialogOpen(true)
          },
          separator: true
        }
      ].filter(Boolean) as MenuAction[])
    )

    const isProtected = isProtectedEvent(event)
    if (!isProtected || event.pubkey === pubkey) {
      actions.push({
        icon: SatelliteDish,
        label: isPending ? t('Publish to ...') : t('Republish to ...'),
        onClick: isSmallScreen
          ? () =>
              showSubMenuActions(
                broadcastSubMenu,
                isPending ? t('Publish to ...') : t('Republish to ...')
              )
          : undefined,
        subMenu: isSmallScreen ? undefined : broadcastSubMenu,
        separator: true
      })
    }

    if (event.pubkey === pubkey && event.kind === kinds.ShortTextNote) {
      const pinned = pinList.includes(event.id)
      actions.push({
        icon: pinned ? PinOff : Pin,
        label: pinned ? t('Unpin from profile') : t('Pin to profile'),
        onClick: async () => {
          closeDrawer()
          await (pinned ? unpin(event) : pin(event))
        }
      })
    }

    if (pubkey && event.pubkey !== pubkey) {
      actions.push({
        icon: TriangleAlert,
        label: t('Report'),
        className: 'text-destructive focus:text-destructive',
        onClick: () => {
          closeDrawer()
          setIsReportDialogOpen(true)
        },
        separator: true
      })
    }

    if (pubkey && event.pubkey !== pubkey) {
      if (isMuted) {
        actions.push({
          icon: Bell,
          label: t('Unmute user'),
          onClick: () => {
            closeDrawer()
            unmute(event.pubkey)
          },
          className: 'text-destructive focus:text-destructive',
          separator: true
        })
      } else {
        actions.push(
          {
            icon: BellOff,
            label: t('Mute user privately'),
            onClick: () => {
              if (!supportsEncryption) return
              closeDrawer()
              mutePrivately(event.pubkey)
            },
            className: 'text-destructive focus:text-destructive',
            separator: true,
            disabled: !supportsEncryption,
            title: !supportsEncryption
              ? t('Your login method does not support encryption')
              : undefined
          },
          {
            icon: BellOff,
            label: t('Mute user publicly'),
            onClick: () => {
              closeDrawer()
              mutePublicly(event.pubkey)
            },
            className: 'text-destructive focus:text-destructive'
          }
        )
      }
    }

    if (pubkey && event.pubkey === pubkey) {
      if (isPending) {
        actions.push({
          icon: FilePen,
          label: t('Edit'),
          onClick: () => {
            closeDrawer()
            openEditor()
          },
          className: 'text-black focus:text-black dark:text-black dark:focus:text-black',
          separator: true
        })
      }

      actions.push({
        icon: isPending ? CloudUpload : Trash2,
        label: isPending ? t('Publish this note') : t('Try deleting this note'),
        onClick: async () => {
          closeDrawer()
          if (isPending) {
            const promise = (async () => {
              const relays = await client.determineTargetRelays(event)
              await client.publishEvent(relays, event)
              discardPendingEvent(event.id)
            })()
            toast.promise(promise, {
              loading: t('Publishing...'),
              success: () => t('Post successful'),
              error: (err) => {
                savePendingEvent(event)
                return t('Failed to post') + ': ' + err.message
              }
            })
          } else {
            attemptDelete(event)
          }
        },
        className: 'text-destructive focus:text-destructive',
        separator: true
      })
    }

    return actions
  }, [
    t,
    event,
    pubkey,
    isMuted,
    isPending,
    isSmallScreen,
    broadcastSubMenu,
    pinList,
    pinBuryState,
    feedSettings.grouped,
    closeDrawer,
    openEditor,
    showSubMenuActions,
    setIsRawEventDialogOpen,
    mutePrivately,
    mutePublicly,
    unmute,
    supportsEncryption,
    setPinned,
    setBuried,
    clearState
  ])

  return menuActions
}
