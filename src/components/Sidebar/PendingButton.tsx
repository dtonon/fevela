import { usePrimaryPage } from '@/PageManager'
import { usePending } from '@/providers/PendingProvider'
import { CloudUpload } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function PendingsButton({ collapse }: { collapse: boolean }) {
  const { navigate, current, display } = usePrimaryPage()
  const { pendingIds } = usePending()

  if (pendingIds.length === 0) {
    return null
  }

  return (
    <SidebarItem
      title="Pending"
      onClick={() => navigate('pending')}
      active={display && current === 'pending'}
      collapse={collapse}
    >
      <CloudUpload />
    </SidebarItem>
  )
}
