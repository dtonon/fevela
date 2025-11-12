import { usePrimaryPage } from '@/PageManager'
import { MessageSquare } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function ConversationsButton() {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'conversations' && display}
      onClick={() => navigate('conversations')}
    >
      <MessageSquare />
    </BottomNavigationBarItem>
  )
}
