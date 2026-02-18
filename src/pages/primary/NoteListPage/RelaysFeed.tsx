import NormalFeed from '@/components/NormalFeed'
import { useFeed } from '@/providers/FeedProvider'
import { useMemo } from 'react'

export default function RelaysFeed() {
  const { feedInfo, relayUrls } = useFeed()

  const subRequests = useMemo(
    () => [{ source: 'relays' as const, urls: relayUrls, filter: {} }],
    [relayUrls]
  )

  if (feedInfo.feedType !== 'relay' && feedInfo.feedType !== 'relays') {
    return null
  }

  return <NormalFeed subRequests={subRequests} showRelayCloseReason />
}
