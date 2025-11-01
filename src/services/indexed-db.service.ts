import { ExtendedKind } from '@/constants'
import { tagNameEquals } from '@/lib/tag'
import { TRelayInfo } from '@/types'
import { NostrUser } from '@nostr/gadgets/metadata'
import { Event, kinds } from 'nostr-tools'

type TValue<T = any> = {
  key: string
  value: T | null
  addedAt: number
}

const StoreNames = {
  PROFILE_EVENTS: 'profileEvents',
  RELAY_LIST_EVENTS: 'relayListEvents',
  FOLLOW_LIST_EVENTS: 'followListEvents',
  MUTE_LIST_EVENTS: 'muteListEvents',
  BOOKMARK_LIST_EVENTS: 'bookmarkListEvents',
  BLOSSOM_SERVER_LIST_EVENTS: 'blossomServerListEvents',
  MUTE_DECRYPTED_TAGS: 'muteDecryptedTags',
  USER_EMOJI_LIST_EVENTS: 'userEmojiListEvents',
  EMOJI_SET_EVENTS: 'emojiSetEvents',
  PIN_LIST_EVENTS: 'pinListEvents',
  FAVORITE_RELAYS: 'favoriteRelays',
  RELAY_SETS: 'relaySets',
  FOLLOWING_FAVORITE_RELAYS: 'followingFavoriteRelays',
  RELAY_INFOS: 'relayInfos',
  RELAY_INFO_EVENTS: 'relayInfoEvents' // deprecated
}

class IndexedDbService {
  static instance: IndexedDbService
  static getInstance(): IndexedDbService {
    if (!IndexedDbService.instance) {
      IndexedDbService.instance = new IndexedDbService()
      IndexedDbService.instance.init()
    }
    return IndexedDbService.instance
  }

  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open('fevela', 9)

        request.onerror = (event) => {
          reject(event)
        }

        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }

        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(StoreNames.PROFILE_EVENTS)) {
            db.createObjectStore(StoreNames.PROFILE_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.RELAY_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.RELAY_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.FOLLOW_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.FOLLOW_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.MUTE_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.MUTE_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.BOOKMARK_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.BOOKMARK_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.MUTE_DECRYPTED_TAGS)) {
            db.createObjectStore(StoreNames.MUTE_DECRYPTED_TAGS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.FAVORITE_RELAYS)) {
            db.createObjectStore(StoreNames.FAVORITE_RELAYS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.RELAY_SETS)) {
            db.createObjectStore(StoreNames.RELAY_SETS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.FOLLOWING_FAVORITE_RELAYS)) {
            db.createObjectStore(StoreNames.FOLLOWING_FAVORITE_RELAYS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.BLOSSOM_SERVER_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.BLOSSOM_SERVER_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.USER_EMOJI_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.USER_EMOJI_LIST_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.EMOJI_SET_EVENTS)) {
            db.createObjectStore(StoreNames.EMOJI_SET_EVENTS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.RELAY_INFOS)) {
            db.createObjectStore(StoreNames.RELAY_INFOS, { keyPath: 'key' })
          }
          if (!db.objectStoreNames.contains(StoreNames.PIN_LIST_EVENTS)) {
            db.createObjectStore(StoreNames.PIN_LIST_EVENTS, { keyPath: 'key' })
          }
          if (db.objectStoreNames.contains(StoreNames.RELAY_INFO_EVENTS)) {
            db.deleteObjectStore(StoreNames.RELAY_INFO_EVENTS)
          }
          this.db = db
        }
      })
      setTimeout(() => this.cleanUp(), 1000 * 60) // 1 minute
    }
    return this.initPromise
  }

  async putNullReplaceableEvent(pubkey: string, kind: number, d?: string) {
    const storeName = this.getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)

      const key = this.getReplaceableEventKey(pubkey, d)
      const getRequest = store.get(key)
      getRequest.onsuccess = () => {
        const oldValue = getRequest.result as TValue<Event> | undefined
        if (oldValue) {
          transaction.commit()
          return resolve(oldValue.value)
        }
        const putRequest = store.put(this.formatValue(key, null))
        putRequest.onsuccess = () => {
          transaction.commit()
          resolve(null)
        }

        putRequest.onerror = (event) => {
          transaction.commit()
          reject(event)
        }
      }

      getRequest.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async putReplaceableEvent(event: Event): Promise<Event> {
    const storeName = this.getStoreNameByKind(event.kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)

      const key = this.getReplaceableEventKeyFromEvent(event)
      const getRequest = store.get(key)
      getRequest.onsuccess = () => {
        const oldValue = getRequest.result as TValue<Event> | undefined
        if (oldValue?.value && oldValue.value.created_at >= event.created_at) {
          transaction.commit()
          return resolve(oldValue.value)
        }
        const putRequest = store.put(this.formatValue(key, event))
        putRequest.onsuccess = () => {
          transaction.commit()
          resolve(event)
        }

        putRequest.onerror = (event) => {
          transaction.commit()
          reject(event)
        }
      }

      getRequest.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async getReplaceableEvent(
    pubkey: string,
    kind: number,
    d?: string
  ): Promise<Event | undefined | null> {
    const storeName = this.getStoreNameByKind(kind)
    if (!storeName) {
      return Promise.reject('store name not found')
    }
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const key = this.getReplaceableEventKey(pubkey, d)
      const request = store.get(key)

      request.onsuccess = () => {
        transaction.commit()
        resolve((request.result as TValue<Event>)?.value)
      }

      request.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async getAllProfiles(): Promise<NostrUser[]> {
    return new Promise<NostrUser[]>((resolve, reject) => {
      const request = window.indexedDB.open('@nostr/gadgets/metadata')

      request.onerror = (event) => {
        reject(event)
      }

      request.onsuccess = () => {
        const db = request.result

        let transaction: IDBTransaction | undefined
        let getAllRequest: IDBRequest<any> | undefined
        try {
          transaction = db.transaction('cache', 'readonly')
          const store = transaction.objectStore('cache')
          getAllRequest = store.getAll()
        } catch (error) {
          transaction?.commit?.()
          db.close()
          reject(error)
        }

        getAllRequest!.onsuccess = async (event) => {
          const values = (event.target as IDBRequest).result as NostrUser[]
          try {
            transaction!.commit()
            db.close()
            resolve(values)
          } catch (error) {
            transaction!.commit()
            db.close()
            reject(error)
          }
        }

        getAllRequest!.onerror = (event) => {
          transaction!.commit()
          db.close()
          reject(event)
        }
      }
    })
  }

  async putFollowingFavoriteRelays(pubkey: string, relays: [string, string[]][]): Promise<void> {
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(StoreNames.FOLLOWING_FAVORITE_RELAYS, 'readwrite')
      const store = transaction.objectStore(StoreNames.FOLLOWING_FAVORITE_RELAYS)

      const putRequest = store.put(this.formatValue(pubkey, relays))
      putRequest.onsuccess = () => {
        transaction.commit()
        resolve()
      }

      putRequest.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async getFollowingFavoriteRelays(pubkey: string): Promise<[string, string[]][] | null> {
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(StoreNames.FOLLOWING_FAVORITE_RELAYS, 'readonly')
      const store = transaction.objectStore(StoreNames.FOLLOWING_FAVORITE_RELAYS)
      const request = store.get(pubkey)

      request.onsuccess = () => {
        transaction.commit()
        resolve((request.result as TValue<[string, string[]][]>)?.value)
      }

      request.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async putRelayInfo(relayInfo: TRelayInfo): Promise<void> {
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(StoreNames.RELAY_INFOS, 'readwrite')
      const store = transaction.objectStore(StoreNames.RELAY_INFOS)

      const putRequest = store.put(this.formatValue(relayInfo.url, relayInfo))
      putRequest.onsuccess = () => {
        transaction.commit()
        resolve()
      }

      putRequest.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  async getRelayInfo(url: string): Promise<TRelayInfo | null> {
    await this.initPromise
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject('database not initialized')
      }
      const transaction = this.db.transaction(StoreNames.RELAY_INFOS, 'readonly')
      const store = transaction.objectStore(StoreNames.RELAY_INFOS)
      const request = store.get(url)

      request.onsuccess = () => {
        transaction.commit()
        resolve((request.result as TValue<TRelayInfo>)?.value)
      }

      request.onerror = (event) => {
        transaction.commit()
        reject(event)
      }
    })
  }

  private getReplaceableEventKeyFromEvent(event: Event): string {
    if (
      [kinds.Metadata, kinds.Contacts].includes(event.kind) ||
      (event.kind >= 10000 && event.kind < 20000)
    ) {
      return this.getReplaceableEventKey(event.pubkey)
    }

    const [, d] = event.tags.find(tagNameEquals('d')) ?? []
    return this.getReplaceableEventKey(event.pubkey, d)
  }

  private getReplaceableEventKey(pubkey: string, d?: string): string {
    return d === undefined ? pubkey : `${pubkey}:${d}`
  }

  private getStoreNameByKind(kind: number): string | undefined {
    switch (kind) {
      case kinds.Metadata:
        return StoreNames.PROFILE_EVENTS
      case kinds.RelayList:
        return StoreNames.RELAY_LIST_EVENTS
      case kinds.Contacts:
        return StoreNames.FOLLOW_LIST_EVENTS
      case kinds.Mutelist:
        return StoreNames.MUTE_LIST_EVENTS
      case ExtendedKind.BLOSSOM_SERVER_LIST:
        return StoreNames.BLOSSOM_SERVER_LIST_EVENTS
      case kinds.Relaysets:
        return StoreNames.RELAY_SETS
      case ExtendedKind.FAVORITE_RELAYS:
        return StoreNames.FAVORITE_RELAYS
      case kinds.BookmarkList:
        return StoreNames.BOOKMARK_LIST_EVENTS
      case kinds.UserEmojiList:
        return StoreNames.USER_EMOJI_LIST_EVENTS
      case kinds.Emojisets:
        return StoreNames.EMOJI_SET_EVENTS
      case kinds.Pinlist:
        return StoreNames.PIN_LIST_EVENTS
      default:
        return undefined
    }
  }

  private formatValue<T>(key: string, value: T): TValue<T> {
    return {
      key,
      value,
      addedAt: Date.now()
    }
  }

  private async cleanUp() {
    await this.initPromise
    if (!this.db) {
      return
    }

    const stores = [
      { name: StoreNames.PROFILE_EVENTS, expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 }, // 1 day
      { name: StoreNames.RELAY_LIST_EVENTS, expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 }, // 1 day
      {
        name: StoreNames.FOLLOW_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 day
      },
      {
        name: StoreNames.BLOSSOM_SERVER_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 days
      },
      {
        name: StoreNames.RELAY_INFOS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 // 1 days
      },
      {
        name: StoreNames.PIN_LIST_EVENTS,
        expirationTimestamp: Date.now() - 1000 * 60 * 60 * 24 * 30 // 30 days
      }
    ]
    const transaction = this.db!.transaction(
      stores.map((store) => store.name),
      'readwrite'
    )
    await Promise.allSettled(
      stores.map(({ name, expirationTimestamp }) => {
        if (expirationTimestamp < 0) {
          return Promise.resolve()
        }
        return new Promise<void>((resolve, reject) => {
          const store = transaction.objectStore(name)
          const request = store.openCursor()
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result
            if (cursor) {
              const value: TValue = cursor.value
              if (value.addedAt < expirationTimestamp) {
                cursor.delete()
              }
              cursor.continue()
            } else {
              resolve()
            }
          }

          request.onerror = (event) => {
            reject(event)
          }
        })
      })
    )
  }
}

const instance = IndexedDbService.getInstance()
export default instance
