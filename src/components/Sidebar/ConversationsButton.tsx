import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { useNotification } from '@/providers/NotificationProvider'
import { Bell } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function ConversationsButton({ collapse }: { collapse: boolean }) {
  const { checkLogin } = useNostr()
  const { navigate, current, display } = usePrimaryPage()
  const { hasNewConversation } = useNotification()

  return (
    <SidebarItem
      title="Conversations"
      onClick={() => checkLogin(() => navigate('conversations'))}
      active={display && current === 'conversations'}
      collapse={collapse}
    >
      <div className="relative">
        <Bell />
        {hasNewConversation && (
          <div className="absolute -top-1 right-0 w-2 h-2 ring-2 ring-background bg-primary rounded-full" />
        )}
      </div>
    </SidebarItem>
  )
}
