import NormalFeed from '@/components/NormalFeed'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TFeedSubRequest } from '@/types'
import { loadFollowsList } from '@nostr/gadgets/lists'
import { useEffect, useState } from 'react'

export default function FollowingFeed() {
  const { pubkey } = useNostr()
  const { feedInfo } = useFeed()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])

  useEffect(() => {
    async function init() {
      if (feedInfo.feedType !== 'following' || !pubkey) {
        setSubRequests([])
        return
      }

      // no need to call outbox.sync() here since that will already happen on NostrProvider
      // for people that the current logged user follows

      setSubRequests([
        { source: 'local', filter: { authors: [pubkey] } },
        {
          source: 'local',
          filter: {
            followedBy: pubkey
          }
        }
      ])
    }

    init()
  }, [feedInfo.feedType, pubkey])

  return <NormalFeed subRequests={subRequests} isMainFeed />
}
