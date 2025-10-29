import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick: () => void
  className?: string
}

interface DesktopMenuProps {
  menuActions: MenuAction[]
  trigger: React.ReactNode
}

export function DesktopMenu({ menuActions, trigger }: DesktopMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        {menuActions.map((action, index) => {
          const Icon = action.icon
          return (
            <DropdownMenuItem key={index} onClick={action.onClick} className={action.className}>
              <Icon />
              {action.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
