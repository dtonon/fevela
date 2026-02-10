export interface FevelaUniverse {
  trending: string[]
  defaultFavoriteRelays: string[]
  recommendedRelays: string[]
  recommendedBlossomServers: string[]
  fevelaApiBaseUrl: string
  defaultNip96Service: string
  defaultNostrConnectRelays: string[]
  bigRelayUrls: string[]
  searchableRelayUrls: string[]
}

declare global {
  interface Window {
    fevela: {
      universe: FevelaUniverse
      store: any
      client: any
      account?: string
      relays(): void
      timestamps(): Promise<void>
      state(): Promise<void>
      loadNostrUser: any
      loadRelayList: any
      loadFollowsList: any
    }
  }
}
