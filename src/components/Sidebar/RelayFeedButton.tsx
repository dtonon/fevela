import { usePrimaryPage } from '@/PageManager'
import { simplifyUrl } from '@/lib/url'
import storage from '@/services/local-storage.service'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Server } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function RelayFeedButton({ collapse }: { collapse: boolean }) {
  const { navigate, current, display } = usePrimaryPage()
  const { pubkey } = useNostr()
  const { feedInfo, switchFeed } = useFeed()

  // get the last browsed relay for current user
  const lastRelay = (pubkey && storage.getLastRelay(pubkey)) || 'nostr.wine'

  return (
    <SidebarItem
      title={simplifyUrl(lastRelay)}
      onClick={() => {
        // navigate to home and switch to relay feed
        navigate('home')
        switchFeed('relay', { relay: lastRelay })
      }}
      active={display && current === 'home' && feedInfo.feedType === 'relay'}
      collapse={collapse}
    >
      <Server />
    </SidebarItem>
  )
}
