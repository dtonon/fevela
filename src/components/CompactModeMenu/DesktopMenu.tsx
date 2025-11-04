import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick: () => void
  className?: string
  disabled?: boolean
  separator?: boolean
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
            <div key={index}>
              {action.separator && index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={action.disabled ? undefined : action.onClick}
                className={action.className}
                disabled={action.disabled}
              >
                <Icon />
                {action.label}
              </DropdownMenuItem>
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
