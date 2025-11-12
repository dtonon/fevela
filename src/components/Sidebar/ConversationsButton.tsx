import { usePrimaryPage } from '@/PageManager'
import { MessageSquare } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function ConversationsButton({ collapse }: { collapse: boolean }) {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <SidebarItem
      title="Conversations"
      onClick={() => navigate('conversations')}
      active={display && current === 'conversations'}
      collapse={collapse}
    >
      <MessageSquare />
    </SidebarItem>
  )
}
