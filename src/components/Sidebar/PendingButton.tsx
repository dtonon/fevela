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
      <div className="relative">
        <CloudUpload />
        <div className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-white ring-2 ring-background">
          {pendingIds.length > 99 ? '99+' : pendingIds.length}
        </div>
      </div>
    </SidebarItem>
  )
}
