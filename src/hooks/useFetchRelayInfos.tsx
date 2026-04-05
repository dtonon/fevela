import { loadRelayInfo, RelayInfoDocument } from '@nostr/gadgets/relays'
import { useEffect, useState } from 'react'

export function useFetchRelayInfos(urls: string[]) {
  const [isFetching, setIsFetching] = useState(true)
  const [relayInfos, setRelayInfos] = useState<(RelayInfoDocument | null)[]>([])
  const [searchableRelayUrls, setSearchableRelayUrls] = useState<string[]>([])
  const urlsString = JSON.stringify(urls)

  useEffect(() => {
    const fetchRelayInfos = async () => {
      setIsFetching(true)

      if (urls.length === 0) {
        return setIsFetching(false)
      }

      const timer = setTimeout(() => {
        setIsFetching(false)
      }, 5000)

      try {
        const relayInfos = await Promise.all(urls.map((url) => loadRelayInfo(url)))
        setRelayInfos(relayInfos)
        setSearchableRelayUrls(
          relayInfos
            .map((relayInfo, index) => ({
              url: urls[index],
              searchable: relayInfo?.supported_nips?.includes(50)
            }))
            .filter((relayInfo) => relayInfo.searchable)
            .map((relayInfo) => relayInfo.url)
        )
      } catch (err) {
        console.error(err)
      } finally {
        clearTimeout(timer)
        setIsFetching(false)
      }
    }

    fetchRelayInfos()
  }, [urlsString])

  return { relayInfos, isFetching, searchableRelayUrls }
}
