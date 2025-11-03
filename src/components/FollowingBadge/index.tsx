import { userIdToPubkey } from '@/lib/pubkey'
import { useFollowList } from '@/providers/FollowListProvider'
import { UserRoundCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function FollowingBadge({ pubkey, userId }: { pubkey?: string; userId?: string }) {
  const { t } = useTranslation()
  const { followList } = useFollowList()
  const isFollowing = useMemo(() => {
    if (pubkey) return followList.includes(pubkey)
    return userId ? followList.includes(userIdToPubkey(userId)) : false
  }, [followList, pubkey, userId])

  if (!isFollowing) return null

  return (
    <div className="rounded-full bg-muted px-2 py-0.5 flex items-center" title={t('Following')}>
      <UserRoundCheck className="!size-3" />
    </div>
  )
}
