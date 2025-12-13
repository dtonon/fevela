import { usePrimaryPage } from '@/PageManager'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { UsersRound } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function FollowingButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { feedInfo, switchFeed } = useFeed()
  const { pubkey } = useNostr()

  return (
    <BottomNavigationBarItem
      active={current === 'home' && display && feedInfo.feedType === 'following'}
      onClick={() => {
        // navigate to home and switch to following feed
        navigate('home')
        switchFeed('following', { pubkey: pubkey! })
      }}
    >
      <UsersRound />
    </BottomNavigationBarItem>
  )
}
