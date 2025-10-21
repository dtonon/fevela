import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'

interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick: () => void
  className?: string
}

interface MobileMenuProps {
  menuActions: MenuAction[]
  trigger: React.ReactNode
  isDrawerOpen: boolean
  setIsDrawerOpen: (open: boolean) => void
  closeDrawer: () => void
}

export function MobileMenu({
  menuActions,
  trigger,
  isDrawerOpen,
  setIsDrawerOpen,
  closeDrawer
}: MobileMenuProps) {
  return (
    <>
      {trigger}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerOverlay onClick={closeDrawer} />
        <DrawerContent hideOverlay className="max-h-[80vh]">
          <div className="overflow-y-auto overscroll-contain py-2" style={{ touchAction: 'pan-y' }}>
            {menuActions.map((action, index) => {
              const Icon = action.icon
              return (
                <Button
                  key={index}
                  onClick={action.onClick}
                  className={`w-full p-6 justify-start text-lg gap-4 [&_svg]:size-5 ${action.className || ''}`}
                  variant="ghost"
                >
                  <Icon />
                  {action.label}
                </Button>
              )
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
