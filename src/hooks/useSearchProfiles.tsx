import { SEARCHABLE_RELAY_URLS } from '@/constants'
import { useFeed } from '@/providers/FeedProvider'
import client from '@/services/client.service'
import { useEffect, useState } from 'react'
import { useFetchRelayInfos } from './useFetchRelayInfos'
import { NostrUser } from '@nostr/gadgets/metadata'

export function useSearchProfiles(search: string, limit: number) {
  const { relayUrls } = useFeed()
  const { searchableRelayUrls } = useFetchRelayInfos(relayUrls)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [profiles, setProfiles] = useState<NostrUser[]>([])

  useEffect(() => {
    ;(async () => {
      if (!search) {
        setProfiles([])
        return
      }

      setIsFetching(true)
      setProfiles([])

      const both: Promise<void>[] = []
      let profiles: NostrUser[] = []
      let have: Set<string> = new Set()

      function handleResults(results: NostrUser[]) {
        if (profiles.length === 0) {
          profiles = results
          have = new Set(results.map((r) => r.pubkey))
        } else {
          for (let i = 0; i < results.length; i++) {
            if (!have.has(results[i].pubkey)) {
              profiles.push(results[i])
              have.add(results[i].pubkey)
            }
          }
        }

        setProfiles(profiles)
      }

      const local = client.searchProfilesFromLocal(search, limit).then(handleResults)
      both.push(local)

      const remote = client
        .searchProfiles(searchableRelayUrls.concat(SEARCHABLE_RELAY_URLS).slice(0, 4), {
          search,
          limit
        })
        .then(handleResults)
      both.push(remote)

      const results = await Promise.allSettled(both)
      if (results.every((p) => p.status === 'rejected')) {
        setError(new Error(`fail to search profiles: ${results.map((v) => v.reason)}`))
      }

      setIsFetching(false)
    })()
  }, [searchableRelayUrls, search, limit])

  return { isFetching, error, profiles }
}
