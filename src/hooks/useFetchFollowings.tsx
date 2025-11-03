import { loadFollowsList } from '@nostr/gadgets/lists'
import { useEffect, useState } from 'react'

export function useFetchFollowings(pubkey?: string | null) {
  const [followings, setFollowings] = useState<string[]>([])
  const [isFetching, setIsFetching] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        setIsFetching(true)
        if (!pubkey) return

        const follows = await loadFollowsList(pubkey)
        setFollowings(follows.items)
      } finally {
        setIsFetching(false)
      }
    }

    init()
  }, [pubkey])

  return { followings, isFetching }
}
