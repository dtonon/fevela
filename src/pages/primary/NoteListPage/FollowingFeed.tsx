import NormalFeed from '@/components/NormalFeed'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TFeedSubRequest } from '@/types'
import { loadFollowsList } from '@nostr/gadgets/lists'
import { useEffect, useState } from 'react'

export default function FollowingFeed() {
  const { pubkey, isReady } = useNostr()
  const { feedInfo } = useFeed()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])

  useEffect(() => {
    if (!pubkey || !isReady) return
    ;(async function () {
      if (feedInfo.feedType !== 'following') {
        setSubRequests([])
        return
      }

      // no need to call outbox.sync() here since that will already happen on NostrProvider
      // for people that the current logged user follows

      const follows = await loadFollowsList(pubkey)
      const us = follows.items.indexOf(pubkey)
      if (us !== -1) {
        follows.items[us] = follows.items[follows.items.length - 1]
        follows.items.length--
      }

      setSubRequests([
        { source: 'local', filter: { authors: [pubkey] } },
        {
          source: 'local',
          filter: {
            authors: follows.items
          }
        }
      ])
    })()
  }, [feedInfo.feedType, pubkey, isReady])

  return <NormalFeed subRequests={subRequests} isMainFeed />
}
