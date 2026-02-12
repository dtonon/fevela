import { userIdToPubkey } from '@/lib/pubkey'
import { useFeed } from '@/providers/FeedProvider'
import { usePinBury } from '@/providers/PinBuryProvider'
import { Pin, ArrowDown } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function PinBuryBadge({ pubkey, userId }: { pubkey?: string; userId?: string }) {
  const { t } = useTranslation()
  const { getPinBuryState } = usePinBury()
  const { settings } = useFeed()

  const state = useMemo(() => {
    const key = pubkey || (userId ? userIdToPubkey(userId) : null)
    return key ? getPinBuryState(key) : null
  }, [getPinBuryState, pubkey, userId])

  // Only show badge when grouped notes is enabled
  if (!settings.grouped) return null
  if (!state) return null

  if (state === 'pinned') {
    return (
      <div className="rounded-full bg-muted px-2 py-0.5 flex items-center" title={t('Pinned')}>
        <Pin className="!size-3" />
      </div>
    )
  }

  if (state === 'buried') {
    return (
      <div className="rounded-full bg-muted px-2 py-0.5 flex items-center" title={t('Buried')}>
        <ArrowDown className="!size-3" />
      </div>
    )
  }

  return null
}
