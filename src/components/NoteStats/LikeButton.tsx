import { useNoteStatsById } from '@/hooks/useNoteStatsById'
import { createReactionDraftEvent } from '@/lib/draft-event'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import noteStatsService, { NEGATIVE_REACTIONS } from '@/services/note-stats.service'
import { Heart, Loader } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Emoji from '../Emoji'
import { formatCount } from './utils'

export default function LikeButton({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { pubkey, publish, checkLogin } = useNostr()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const [liking, setLiking] = useState(false)
  const noteStats = useNoteStatsById(event.id)
  const { didLike, likeCount } = useMemo(() => {
    const stats = noteStats || {}
    // Exclude negative reactions (e.g. '-', '❌') from the like count and
    // from the user's own "didLike" state, so the like button still works
    // for users who previously sent a downvote/rejection reaction.
    const positiveLikes = (stats.likes ?? []).filter(
      (like) =>
        !NEGATIVE_REACTIONS.has(
          like.emoji as string /* if it's not a string it will fail the check anyway */
        )
    )
    const didLike = positiveLikes.some((like) => like.pubkey === pubkey)
    const visibleLikes = hideUntrustedInteractions
      ? positiveLikes.filter((like) => isUserTrusted(like.pubkey))
      : positiveLikes
    return { didLike, likeCount: visibleLikes.length }
  }, [noteStats, pubkey, hideUntrustedInteractions, isUserTrusted])

  const like = async () => {
    checkLogin(async () => {
      if (liking || !pubkey) return

      setLiking(true)
      const timer = setTimeout(() => setLiking(false), 5_000)

      try {
        if (!noteStats?.updatedAt) {
          await noteStatsService.fetchNoteStats(event, pubkey)
        }

        const reaction = createReactionDraftEvent(event, '+')
        const seenOn = client.getSeenEventRelayUrls(event.id, event)
        const evt = await publish(reaction, { additionalRelayUrls: seenOn })
        noteStatsService.updateNoteStatsByEvents([evt])
      } catch (error) {
        console.error('like failed', error)
      } finally {
        setLiking(false)
        clearTimeout(timer)
      }
    })
  }

  const trigger = (
    <button
      className="flex items-center enabled:hover:text-primary gap-1 px-3 h-full text-muted-foreground"
      title={t('Like')}
      disabled={liking}
      onClick={like}
    >
      {liking ? (
        <Loader className="animate-spin" />
      ) : didLike ? (
        <>
          <Emoji emoji="+" classNames={{ img: 'size-4' }} />
          {!!likeCount && <div className="text-sm">{formatCount(likeCount)}</div>}
        </>
      ) : (
        <>
          <Heart className="size-4" />
          {!!likeCount && <div className="text-sm">{formatCount(likeCount)}</div>}
        </>
      )}
    </button>
  )

  return trigger
}
