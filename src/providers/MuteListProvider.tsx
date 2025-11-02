import { createMuteListDraftEvent } from '@/lib/draft-event'
import client from '@/services/client.service'
import dayjs from 'dayjs'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNostr } from './NostrProvider'
import { TMutedList } from '@/types'

type TMuteListContext = {
  changing: boolean
  mutePubkeySet: Set<string>
  getMutePubkeys: () => string[]
  getMuteType: (pubkey: string) => 'public' | 'private' | null
  mutePublicly: (pubkey: string) => Promise<void>
  mutePrivately: (pubkey: string) => Promise<void>
  unmute: (pubkey: string) => Promise<void>
}

const MuteListContext = createContext<TMuteListContext | undefined>(undefined)

export const useMuteList = () => {
  const context = useContext(MuteListContext)
  if (!context) {
    throw new Error('useMuteList must be used within a MuteListProvider')
  }
  return context
}

export function MuteListProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const {
    pubkey: accountPubkey,
    muteList,
    publish,
    updateMuteListEvent,
    nip04Encrypt,
    nip04Decrypt
  } = useNostr()
  const [changing, setChanging] = useState(false)
  const [lastPublished, setLastPublished] = useState(0)

  const getMutePubkeys = () => {
    return [...muteList.public, ...muteList.private]
  }

  const mutePubkeySet = useMemo(() => {
    return new Set([...muteList.private, ...muteList.public])
  }, [muteList])

  const getMuteType = useCallback(
    (pubkey: string): 'public' | 'private' | null => {
      if (muteList.public.includes(pubkey)) return 'public'
      if (muteList.private.includes(pubkey)) return 'private'
      return null
    },
    [muteList]
  )

  const publishNewMuteListEvent = async (list: TMutedList) => {
    if (!accountPubkey) return

    const tags = list.public.map((pubkey) => ['p', pubkey])
    const content = await nip04Encrypt(
      accountPubkey,
      JSON.stringify(list.private.map((pubkey) => ['p', pubkey]))
    )

    if (dayjs().unix() === lastPublished) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    const newMuteListDraftEvent = createMuteListDraftEvent(tags, content)
    const event = await publish(newMuteListDraftEvent)
    toast.success(t('Successfully updated mute list'))
    setLastPublished(dayjs().unix())
    updateMuteListEvent(event)

    return event
  }

  const checkMuteList = (muteList: TMutedList) => {
    if (muteList.public.length === 0 && muteList.private.length === 0) {
      const result = confirm(t('MuteListNotFoundConfirmation'))
      if (!result) {
        throw new Error('Mute list not found')
      }
    }
  }

  const mutePublicly = async (pubkey: string) => {
    if (!accountPubkey || changing) return

    setChanging(true)
    try {
      const muteList = await client.fetchMuteList(accountPubkey, nip04Decrypt)
      checkMuteList(muteList)

      if (!muteList.public.includes(pubkey)) {
        // add to public
        muteList.public.push(pubkey)

        {
          // and remove from private
          const idx = muteList.private.indexOf(pubkey)
          if (idx !== -1) {
            muteList.private.splice(idx, 1)
          }
        }

        publishNewMuteListEvent(muteList)
      }
    } catch (error) {
      toast.error(t('Failed to mute user publicly') + ': ' + (error as Error).message)
    } finally {
      setChanging(false)
    }
  }

  const mutePrivately = async (pubkey: string) => {
    if (!accountPubkey || changing) return

    setChanging(true)
    try {
      const muteList = await client.fetchMuteList(accountPubkey, nip04Decrypt)
      checkMuteList(muteList)

      if (!muteList.private.includes(pubkey)) {
        // add to private
        muteList.private.push(pubkey)

        {
          // and remove from public
          const idx = muteList.public.indexOf(pubkey)
          if (idx !== -1) {
            muteList.public.splice(idx, 1)
          }
        }

        publishNewMuteListEvent(muteList)
      }
    } catch (error) {
      toast.error(t('Failed to mute user privately') + ': ' + (error as Error).message)
    } finally {
      setChanging(false)
    }
  }

  const unmute = async (pubkey: string) => {
    if (!accountPubkey || changing) return

    setChanging(true)
    try {
      const muteList = await client.fetchMuteList(accountPubkey, nip04Decrypt)
      checkMuteList(muteList)

      let modified = false
      {
        const idx = muteList.private.indexOf(pubkey)
        if (idx !== -1) {
          muteList.private.splice(idx, 1)
          modified = true
        }
      }
      {
        const idx = muteList.public.indexOf(pubkey)
        if (idx !== -1) {
          muteList.public.splice(idx, 1)
          modified = true
        }
      }

      if (modified) {
        publishNewMuteListEvent(muteList)
      }
    } finally {
      setChanging(false)
    }
  }

  return (
    <MuteListContext.Provider
      value={{
        mutePubkeySet,
        changing,
        getMutePubkeys,
        getMuteType,
        mutePublicly,
        mutePrivately,
        unmute
      }}
    >
      {children}
    </MuteListContext.Provider>
  )
}
