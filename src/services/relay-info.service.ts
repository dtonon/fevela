import { simplifyUrl } from '@/lib/url'
import indexDb from '@/services/indexed-db.service'
import { TAwesomeRelayCollection, TRelayInfo } from '@/types'
import DataLoader from 'dataloader'
import FlexSearch from 'flexsearch'

class RelayInfoService {
  static instance: RelayInfoService

  public static getInstance(): RelayInfoService {
    if (!RelayInfoService.instance) {
      RelayInfoService.instance = new RelayInfoService()
    }
    return RelayInfoService.instance
  }

  private initPromise: Promise<void> | null = null
  private awesomeRelayCollections: Promise<TAwesomeRelayCollection[]> | null = null
  private relayInfoMap = new Map<string, TRelayInfo>()
  private relayInfoIndex = new FlexSearch.Index({
    tokenize: 'forward',
    encode: (str) =>
      str
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x00-\x7F]/g, (match) => ` ${match} `)
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
  })
  private fetchDataloader = new DataLoader<string, TRelayInfo | undefined>(
    async (urls) => {
      const results = await Promise.allSettled(urls.map((url) => this._getRelayInfo(url)))
      return results.map((res) => (res.status === 'fulfilled' ? res.value : undefined))
    },
    { maxBatchSize: 1 }
  )
  private relayUrlsForRandom: string[] = []

  async search(query: string) {
    if (this.initPromise) {
      await this.initPromise
    }

    if (!query) {
      const arr = Array.from(this.relayInfoMap.values())
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }

    const result = await this.relayInfoIndex.searchAsync(query)
    return result.map((url) => this.relayInfoMap.get(url as string)).filter(Boolean) as TRelayInfo[]
  }

  async getRelayInfos(urls: string[]) {
    if (urls.length === 0) {
      return []
    }
    const relayInfos = await this.fetchDataloader.loadMany(urls)
    return relayInfos.map((relayInfo) => (relayInfo instanceof Error ? undefined : relayInfo))
  }

  async getRelayInfo(url: string) {
    return this.fetchDataloader.load(url)
  }

  async getRandomRelayInfos(count: number) {
    if (this.initPromise) {
      await this.initPromise
    }

    const relayInfos: TRelayInfo[] = []
    while (relayInfos.length < count) {
      const randomIndex = Math.floor(Math.random() * this.relayUrlsForRandom.length)
      const url = this.relayUrlsForRandom[randomIndex]
      this.relayUrlsForRandom.splice(randomIndex, 1)
      if (this.relayUrlsForRandom.length === 0) {
        this.relayUrlsForRandom = Array.from(this.relayInfoMap.keys())
      }

      const relayInfo = this.relayInfoMap.get(url)
      if (relayInfo) {
        relayInfos.push(relayInfo)
      }
    }
    return relayInfos
  }

  async getAwesomeRelayCollections() {
    if (this.awesomeRelayCollections) return this.awesomeRelayCollections

    this.awesomeRelayCollections = (async () => {
      try {
        const res = await fetch(
          'https://raw.githubusercontent.com/CodyTseng/awesome-nostr-relays/master/dist/collections.json'
        )
        if (!res.ok) {
          throw new Error('Failed to fetch awesome relay collections')
        }
        const data = (await res.json()) as { collections: TAwesomeRelayCollection[] }
        return data.collections
      } catch (error) {
        console.error('Error fetching awesome relay collections:', error)
        return []
      }
    })()

    return this.awesomeRelayCollections
  }

  private async _getRelayInfo(url: string) {
    const exist = this.relayInfoMap.get(url)
    if (exist) {
      return exist
    }

    const storedRelayInfo = await indexDb.getRelayInfo(url)
    if (storedRelayInfo) {
      return await this.addRelayInfo(storedRelayInfo)
    }

    const nip11 = await this.fetchRelayNip11(url)
    const relayInfo = {
      ...(nip11 ?? {}),
      url,
      shortUrl: simplifyUrl(url)
    }
    return await this.addRelayInfo(relayInfo)
  }

  private async fetchRelayNip11(url: string) {
    try {
      const res = await fetch(url.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' }
      })
      return res.json() as Omit<TRelayInfo, 'url' | 'shortUrl'>
    } catch {
      return undefined
    }
  }

  private async addRelayInfo(relayInfo: TRelayInfo) {
    if (!Array.isArray(relayInfo.supported_nips)) {
      relayInfo.supported_nips = []
    }

    this.relayInfoMap.set(relayInfo.url, relayInfo)
    await Promise.allSettled([
      this.relayInfoIndex.addAsync(
        relayInfo.url,
        [
          relayInfo.shortUrl,
          ...relayInfo.shortUrl.split('.'),
          relayInfo.name ?? '',
          relayInfo.description ?? ''
        ].join(' ')
      ),
      indexDb.putRelayInfo(relayInfo)
    ])
    return relayInfo
  }
}

const instance = RelayInfoService.getInstance()
export default instance
