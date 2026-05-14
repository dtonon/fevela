import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Ellipsis } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useState } from 'react'
import PostEditor from '../PostEditor'
import { DesktopMenu } from './DesktopMenu'
import { MobileMenu } from './MobileMenu'
import RawEventDialog from './RawEventDialog'
import ReportDialog from './ReportDialog'
import { SubMenuAction, useMenuActions } from './useMenuActions'

export default function NoteOptions({ event, className }: { event: Event; className?: string }) {
  const { isSmallScreen } = useScreenSize()
  const [isRawEventDialogOpen, setIsRawEventDialogOpen] = useState(false)
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [showSubMenu, setShowSubMenu] = useState(false)
  const [activeSubMenu, setActiveSubMenu] = useState<SubMenuAction[]>([])
  const [subMenuTitle, setSubMenuTitle] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>()

  const closeDrawer = () => {
    setIsDrawerOpen(false)
    setShowSubMenu(false)
  }

  const goBackToMainMenu = () => {
    setShowSubMenu(false)
  }

  const showSubMenuActions = (subMenu: SubMenuAction[], title: string) => {
    setActiveSubMenu(subMenu)
    setSubMenuTitle(title)
    setShowSubMenu(true)
  }

  const openEditor = () => {
    setEditingEvent(event)
    setIsEditorOpen(true)
  }

  const closeEditor = (open: boolean) => {
    setIsEditorOpen(open)
    if (!open) {
      setEditingEvent(undefined)
    }
  }

  const menuActions = useMenuActions({
    event,
    closeDrawer,
    openEditor,
    showSubMenuActions,
    setIsRawEventDialogOpen,
    setIsReportDialogOpen,
    isSmallScreen
  })

  const trigger = (
    <button
      className="flex items-center text-muted-foreground hover:text-foreground pl-2 h-full"
      onClick={() => setIsDrawerOpen(true)}
    >
      <Ellipsis />
    </button>
  )

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      {isSmallScreen ? (
        <MobileMenu
          menuActions={menuActions}
          trigger={trigger}
          isDrawerOpen={isDrawerOpen}
          setIsDrawerOpen={setIsDrawerOpen}
          showSubMenu={showSubMenu}
          activeSubMenu={activeSubMenu}
          subMenuTitle={subMenuTitle}
          closeDrawer={closeDrawer}
          goBackToMainMenu={goBackToMainMenu}
        />
      ) : (
        <DesktopMenu menuActions={menuActions} trigger={trigger} />
      )}

      <RawEventDialog
        event={event}
        isOpen={isRawEventDialogOpen}
        onClose={() => setIsRawEventDialogOpen(false)}
      />
      <ReportDialog
        event={event}
        isOpen={isReportDialogOpen}
        closeDialog={() => setIsReportDialogOpen(false)}
      />
      <PostEditor
        defaultContent={editingEvent?.content}
        editingEvent={editingEvent}
        open={isEditorOpen}
        setOpen={closeEditor}
      />
    </div>
  )
}
