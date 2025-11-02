import UserAvatar from '@/components/UserAvatar'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { loadFollowsList } from '@nostr/gadgets/lists'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function FollowedBy({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const [followedBy, setFollowedBy] = useState<string[]>([])
  const { pubkey: accountPubkey } = useNostr()

  useEffect(() => {
    if (!pubkey || !accountPubkey) return

    const init = async () => {
      const followings = (await loadFollowsList(accountPubkey)).items.reverse()
      const followingsOfFollowings = await Promise.all(
        followings.map(async (following) => {
          return (await loadFollowsList(following)).items
        })
      )
      const _followedBy: string[] = []
      const limit = isSmallScreen ? 3 : 5
      for (const [index, following] of followings.entries()) {
        if (following === pubkey) continue
        if (followingsOfFollowings[index].includes(pubkey)) {
          _followedBy.push(following)
        }
        if (_followedBy.length >= limit) {
          break
        }
      }
      setFollowedBy(_followedBy)
    }
    init()
  }, [pubkey, accountPubkey])

  if (followedBy.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      <div className="text-muted-foreground">{t('Followed by')}</div>
      {followedBy.map((p) => (
        <UserAvatar userId={p} key={p} size="xSmall" />
      ))}
    </div>
  )
}
