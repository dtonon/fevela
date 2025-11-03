import { createFollowListDraftEvent } from '@/lib/draft-event'
import { createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNostr } from './NostrProvider'
import { loadFollowsList } from '@nostr/gadgets/lists'

type TFollowListContext = {
  followList: string[]
  follow: (pubkey: string) => Promise<void>
  unfollow: (pubkey: string) => Promise<void>
}

const FollowListContext = createContext<TFollowListContext | undefined>(undefined)

export const useFollowList = () => {
  const context = useContext(FollowListContext)
  if (!context) {
    throw new Error('useFollowList must be used within a FollowListProvider')
  }
  return context
}

export function FollowListProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { pubkey: accountPubkey, followList, publish, updateFollowListEvent } = useNostr()

  const follow = async (pubkey: string) => {
    if (!accountPubkey) return

    const follows = await loadFollowsList(accountPubkey)
    if (!follows.event) {
      const result = confirm(t('FollowListNotFoundConfirmation'))

      if (!result) {
        return
      }
    }
    const newFollowListDraftEvent = createFollowListDraftEvent(
      (follows.event?.tags || []).concat([['p', pubkey]]),
      follows.event?.content || ''
    )
    const newFollowListEvent = await publish(newFollowListDraftEvent)
    await updateFollowListEvent(newFollowListEvent)
  }

  const unfollow = async (pubkey: string) => {
    if (!accountPubkey) return

    const follows = await loadFollowsList(accountPubkey)
    if (!follows.event) return

    const newFollowListDraftEvent = createFollowListDraftEvent(
      follows.event.tags.filter(([tagName, tagValue]) => tagName !== 'p' || tagValue !== pubkey),
      follows.event.content
    )
    const newFollowListEvent = await publish(newFollowListDraftEvent)
    await updateFollowListEvent(newFollowListEvent)
  }

  return (
    <FollowListContext.Provider
      value={{
        followList,
        follow,
        unfollow
      }}
    >
      {children}
    </FollowListContext.Provider>
  )
}
