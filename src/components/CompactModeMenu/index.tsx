import { usePinBury } from '@/providers/PinBuryProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Pin, PinOff, ArrowDown, ArrowUp, Ellipsis } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DesktopMenu } from './DesktopMenu'
import { MobileMenu } from './MobileMenu'

interface CompactModeMenuProps {
  pubkey: string
  className?: string
}

export default function CompactModeMenu({ pubkey, className }: CompactModeMenuProps) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const { getPinBuryState, setPinned, setBuried, clearState } = usePinBury()
  const { settings } = useGroupedNotes()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const state = useMemo(() => getPinBuryState(pubkey), [getPinBuryState, pubkey])

  const closeDrawer = () => {
    setIsDrawerOpen(false)
  }

  const menuActions = useMemo(() => {
    const actions = []

    if (state === 'pinned') {
      actions.push({
        icon: PinOff,
        label: t('GroupedNotesUnpin'),
        onClick: () => {
          closeDrawer()
          clearState(pubkey)
        }
      })
      actions.push({
        icon: ArrowDown,
        label: t('GroupedNotesBury'),
        onClick: () => {
          closeDrawer()
          setBuried(pubkey)
        }
      })
    } else if (state === 'buried') {
      actions.push({
        icon: ArrowUp,
        label: t('GroupedNotesUnbury'),
        onClick: () => {
          closeDrawer()
          clearState(pubkey)
        }
      })
      actions.push({
        icon: Pin,
        label: t('GroupedNotesPin'),
        onClick: () => {
          closeDrawer()
          setPinned(pubkey)
        }
      })
    } else {
      actions.push({
        icon: Pin,
        label: t('GroupedNotesPin'),
        onClick: () => {
          closeDrawer()
          setPinned(pubkey)
        }
      })
      actions.push({
        icon: ArrowDown,
        label: t('GroupedNotesBury'),
        onClick: () => {
          closeDrawer()
          setBuried(pubkey)
        }
      })
    }

    return actions
  }, [state, pubkey, t, setPinned, setBuried, clearState])

  const trigger = (
    <button
      className="flex items-center text-muted-foreground hover:text-foreground h-full"
      onClick={(e) => {
        e.stopPropagation()
        setIsDrawerOpen(true)
      }}
    >
      <Ellipsis className="!size-5" />
    </button>
  )

  // Only show menu when grouped notes is enabled
  if (!settings.enabled) return null

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      {isSmallScreen ? (
        <MobileMenu
          menuActions={menuActions}
          trigger={trigger}
          isDrawerOpen={isDrawerOpen}
          setIsDrawerOpen={setIsDrawerOpen}
          closeDrawer={closeDrawer}
        />
      ) : (
        <DesktopMenu menuActions={menuActions} trigger={trigger} />
      )}
    </div>
  )
}
