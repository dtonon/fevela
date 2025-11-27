import NormalFeed from '@/components/NormalFeed'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TFeedSubRequest } from '@/types'
import { useEffect, useState } from 'react'

export default function FollowingFeed() {
  const { pubkey, isReady, followList } = useNostr()
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
      setSubRequests([
        {
          source: 'local',
          filter: {
            followedBy: pubkey
          }
        }
      ])
    })()
  }, [feedInfo.feedType, pubkey, isReady, followList])

  return <NormalFeed subRequests={subRequests} isMainFeed />
}
