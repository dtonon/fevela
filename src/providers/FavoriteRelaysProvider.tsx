import { DEFAULT_FAVORITE_RELAYS } from '@/constants'
import { createFavoriteRelaysDraftEvent, createRelaySetDraftEvent } from '@/lib/draft-event'
import { getReplaceableCoordinate } from '@/lib/event'
import { randomString } from '@/lib/random'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import { TRelaySet } from '@/types'
import { Event, kinds } from 'nostr-tools'
import { createContext, useContext, useEffect, useState } from 'react'
import { useNostr } from './NostrProvider'
import { loadRelaySets } from '@nostr/gadgets/sets'

type TFavoriteRelaysContext = {
  urls: string[]
  addFavoriteRelays: (relayUrls: string[]) => Promise<void>
  deleteFavoriteRelays: (relayUrls: string[]) => Promise<void>
  reorderFavoriteRelays: (reorderedRelays: string[]) => Promise<void>
  relaySets: TRelaySet[]
  createRelaySet: (relaySetName: string, relayUrls?: string[]) => Promise<void>
  addRelaySets: (newRelaySetEvents: Event[]) => Promise<void>
  deleteRelaySet: (pubkey: string, id: string) => Promise<void>
  updateRelaySet: (newSet: TRelaySet) => Promise<void>
  reorderRelaySets: (reorderedSets: TRelaySet[]) => Promise<void>
}

const FavoriteRelaysContext = createContext<TFavoriteRelaysContext | undefined>(undefined)

export const useFavoriteRelays = () => {
  const context = useContext(FavoriteRelaysContext)
  if (!context) {
    throw new Error('useFavoriteRelays must be used within a FavoriteRelaysProvider')
  }
  return context
}

export function FavoriteRelaysProvider({ children }: { children: React.ReactNode }) {
  const { favoriteRelays, updateFavoriteRelaysEvent, pubkey, publish } = useNostr()
  const [rerun, setRerunCount] = useState<number>(0)
  const [relaySets, setRelaySets] = useState<TRelaySet[]>([])
  const [urls, setURLs] = useState<string[]>([])

  useEffect(() => {
    if (favoriteRelays.length === 0) {
      setURLs(DEFAULT_FAVORITE_RELAYS)
      return
    }

    ;(async () => {
      const relays: string[] = []

      favoriteRelays.forEach((item) => {
        if (typeof item === 'string') {
          const normalizedUrl = normalizeUrl(item)
          if (normalizedUrl && !relays.includes(normalizedUrl)) {
            relays.push(normalizedUrl)
          }
        } else {
          if (item.kind !== kinds.Relaysets) return

          loadRelaySets(item.pubkey).then((sets) => {
            const set = sets[item.identifier]
            if (set) {
              setRelaySets((relaySets) => {
                if (relaySets.find((existing) => item.identifier === existing.id)) {
                  return relaySets
                }
                return [
                  ...relaySets,
                  {
                    relayUrls: set.items,
                    pubkey: set.event.pubkey,
                    id: item.identifier,
                    name:
                      set.event.tags.find(([k]) => k === 'title')?.[1] || set.items.length === 1
                        ? set.items[0]
                        : item.identifier
                  }
                ]
              })
            }
          })
        }
      })

      setURLs(relays)
    })()
  }, [favoriteRelays, rerun])

  const addFavoriteRelays = async (relayUrls: string[]) => {
    const normalizedUrls = relayUrls
      .map((relayUrl) => normalizeUrl(relayUrl))
      .filter((url) => !!url && !favoriteRelays.includes(url))
    if (!normalizedUrls.length) return

    updateFavoriteRelaysEvent(
      await publish(createFavoriteRelaysDraftEvent([...urls, ...normalizedUrls], relaySets))
    )
  }

  const deleteFavoriteRelays = async (relayUrls: string[]) => {
    const normalizedUrls = relayUrls
      .map((relayUrl) => normalizeUrl(relayUrl))
      .filter((url) => !!url && favoriteRelays.includes(url))
    if (!normalizedUrls.length) return

    updateFavoriteRelaysEvent(
      await publish(
        createFavoriteRelaysDraftEvent(
          urls.filter((url) => !normalizedUrls.includes(url)),
          relaySets
        )
      )
    )
  }

  const createRelaySet = async (relaySetName: string, relayUrls: string[] = []) => {
    if (!pubkey) return

    const newRelaySetEvent = await publish(
      createRelaySetDraftEvent({
        id: randomString(),
        pubkey,
        name: relaySetName,
        relayUrls: relayUrls.map((url) => normalizeUrl(url)).filter((url) => isWebsocketUrl(url))
      })
    )

    // force update here (so when we reload on useEffect we get this one)
    await loadRelaySets(pubkey, [], true)

    // this will cause useEffect to run again
    updateFavoriteRelaysEvent(
      await publish(createFavoriteRelaysDraftEvent(urls, [...relaySets, newRelaySetEvent]))
    )
  }

  const addRelaySets = async (newRelaySetEvents: Event[]) => {
    updateFavoriteRelaysEvent(
      await publish(createFavoriteRelaysDraftEvent(urls, [...relaySets, ...newRelaySetEvents]))
    )
  }

  const deleteRelaySet = async (pubkey: string, id: string) => {
    const idx = relaySets.findIndex((relaySet) => relaySet.pubkey === pubkey && relaySet.id === id)
    if (idx !== -1) {
      relaySets.splice(idx, 1)
      updateFavoriteRelaysEvent(await publish(createFavoriteRelaysDraftEvent(urls, relaySets)))
    }
  }

  const updateRelaySet = async (newSet: TRelaySet) => {
    if (!pubkey) return

    await publish(createRelaySetDraftEvent(newSet))

    // force update here (so when we reload on useEffect we get this one)
    await loadRelaySets(pubkey, [], true)

    // force useEffect to rerun
    setRerunCount((c) => c + 1)
  }

  const reorderFavoriteRelays = async (reorderedRelays: string[]) => {
    setURLs(reorderedRelays)
    updateFavoriteRelaysEvent(
      await publish(createFavoriteRelaysDraftEvent(reorderedRelays, relaySets))
    )
  }

  const reorderRelaySets = async (reorderedSets: TRelaySet[]) => {
    setRelaySets(reorderedSets)
    const draftEvent = createFavoriteRelaysDraftEvent(
      urls,
      reorderedSets.map((set) => [
        'a',
        getReplaceableCoordinate(kinds.Relaysets, set.pubkey, set.id)
      ])
    )
    const newFavoriteRelaysEvent = await publish(draftEvent)
    updateFavoriteRelaysEvent(newFavoriteRelaysEvent)
  }

  return (
    <FavoriteRelaysContext.Provider
      value={{
        urls,
        addFavoriteRelays,
        deleteFavoriteRelays,
        reorderFavoriteRelays,
        relaySets,
        createRelaySet,
        addRelaySets,
        deleteRelaySet,
        updateRelaySet,
        reorderRelaySets
      }}
    >
      {children}
    </FavoriteRelaysContext.Provider>
  )
}
