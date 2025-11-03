import NormalFeed from '@/components/NormalFeed'
import { useFeed } from '@/providers/FeedProvider'

export default function RelaysFeed() {
  const { feedInfo, relayUrls } = useFeed()

  if (feedInfo.feedType !== 'relay' && feedInfo.feedType !== 'relays') {
    return null
  }

  return (
    <NormalFeed
      subRequests={[{ source: 'relays', urls: relayUrls, filter: {} }]}
      isMainFeed
      showRelayCloseReason
    />
  )
}
