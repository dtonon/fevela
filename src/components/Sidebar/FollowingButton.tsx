import { usePrimaryPage } from '@/PageManager'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { UsersRound } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function FollowingButton({ collapse }: { collapse: boolean }) {
  const { navigate, current, display } = usePrimaryPage()
  const { feedInfo, switchFeed } = useFeed()
  const { pubkey } = useNostr()

  return (
    <SidebarItem
      title="Following"
      onClick={() => {
        // navigate to home and switch to following feed
        navigate('home')
        switchFeed('following', { pubkey: pubkey! })
      }}
      active={display && current === 'home' && feedInfo.feedType === 'following'}
      collapse={collapse}
    >
      <UsersRound />
    </SidebarItem>
  )
}
