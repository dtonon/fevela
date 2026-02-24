import { useFollowList } from '@/providers/FollowListProvider'
import { UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function FollowingBadge({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { followList } = useFollowList()
  const isFollowing = followList.includes(pubkey)

  if (!isFollowing) return null

  return (
    <div className="rounded-full bg-muted px-2 py-0.5 flex items-center" title={t('Following')}>
      <UserRoundCheck className="!size-3" />
    </div>
  )
}
