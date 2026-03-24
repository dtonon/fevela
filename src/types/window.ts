export interface FevelaUniverse {
  trending: string[]
  defaultFavoriteRelays: string[]
  recommendedRelays: string[]
  recommendedBlossomServers: string[]
  clientHandlers: {
    byKind: Record<number, ClientHandler[]>
    fallback: ClientHandler[]
  }
  fevelaApiBaseUrl: string
  defaultNip96Service: string
  defaultNostrConnectRelays: string[]
  bigRelayUrls: string[]
  searchableRelayUrls: string[]
}

export type ClientHandler = {
  name: string
  urlPattern: string
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
