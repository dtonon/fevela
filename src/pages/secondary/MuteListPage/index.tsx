import MuteButton from '@/components/MuteButton'
import Nip05 from '@/components/Nip05'
import { Button } from '@/components/ui/button'
import UserAvatar from '@/components/UserAvatar'
import Username from '@/components/Username'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import dayjs from 'dayjs'
import { Loader, Lock, Unlock } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NotFoundPage from '../NotFoundPage'
import { username } from '@/lib/event-metadata'

const MuteListPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const { profile, pubkey } = useNostr()
  const { getMutePubkeys, getMuteType, muteListEvent } = useMuteList()
  const allPubkeys = useMemo(() => getMutePubkeys(), [pubkey])
  const publicPubkeys = useMemo(
    () => allPubkeys.filter((p) => getMuteType(p) === 'public'),
    [allPubkeys, getMuteType]
  )
  const privatePubkeys = useMemo(
    () => allPubkeys.filter((p) => getMuteType(p) === 'private'),
    [allPubkeys, getMuteType]
  )
  const [visiblePublic, setVisiblePublic] = useState<string[]>([])
  const [visiblePrivate, setVisiblePrivate] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisiblePublic(publicPubkeys.slice(0, 10))
    setVisiblePrivate(privatePubkeys.slice(0, 10))
  }, [allPubkeys])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        if (publicPubkeys.length > visiblePublic.length) {
          setVisiblePublic((prev) => [...prev, ...publicPubkeys.slice(prev.length, prev.length + 10)])
        } else if (privatePubkeys.length > visiblePrivate.length) {
          setVisiblePrivate((prev) => [
            ...prev,
            ...privatePubkeys.slice(prev.length, prev.length + 10)
          ])
        }
      },
      { rootMargin: '10px', threshold: 1 }
    )
    const el = bottomRef.current
    if (el) observer.observe(el)
    return () => {
      if (el) observer.unobserve(el)
    }
  }, [visiblePublic, visiblePrivate, publicPubkeys, privatePubkeys])

  if (!profile) {
    return <NotFoundPage />
  }

  const hasMore =
    publicPubkeys.length > visiblePublic.length || privatePubkeys.length > visiblePrivate.length

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={t("username's muted", { username: username(profile) })}
      displayScrollToTopButton
    >
      <div className="space-y-4 px-4 pt-2">
        {muteListEvent && (
          <div className="text-xs text-muted-foreground border rounded-lg p-3 space-y-1 font-mono">
            <div>
              <span className="text-foreground/50">event </span>
              {muteListEvent.id}
            </div>
            <div>
              <span className="text-foreground/50">created </span>
              {dayjs.unix(muteListEvent.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </div>
            <div>
              <span className="text-foreground/50">public </span>
              {publicPubkeys.length}
              <span className="text-foreground/50 ml-3">private </span>
              {privatePubkeys.length}
            </div>
          </div>
        )}
        {!muteListEvent && allPubkeys.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {t('No mute list event found')}
          </div>
        )}

        {publicPubkeys.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Unlock className="size-3" />
              {t('Public')} ({publicPubkeys.length})
            </div>
            {visiblePublic.map((pubkey, index) => (
              <UserItem key={`pub-${index}-${pubkey}`} pubkey={pubkey} />
            ))}
          </div>
        )}

        {privatePubkeys.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Lock className="size-3" />
              {t('Private')} ({privatePubkeys.length})
            </div>
            {visiblePrivate.map((pubkey, index) => (
              <UserItem key={`priv-${index}-${pubkey}`} pubkey={pubkey} />
            ))}
          </div>
        )}

        {hasMore && <div ref={bottomRef} />}
      </div>
    </SecondaryPageLayout>
  )
})
MuteListPage.displayName = 'MuteListPage'
export default MuteListPage

function UserItem({ pubkey }: { pubkey: string }) {
  const { changing, getMuteType, mutePublicly, mutePrivately } = useMuteList()
  const { profile } = useFetchProfile(pubkey)
  const muteType = useMemo(() => getMuteType(pubkey), [pubkey, getMuteType])
  const [switching, setSwitching] = useState(false)

  return (
    <div className="flex gap-2 items-start">
      <UserAvatar userId={pubkey} className="shrink-0" />
      <div className="w-full overflow-hidden">
        <Username
          userId={pubkey}
          className="font-semibold truncate max-w-full w-fit"
          skeletonClassName="h-4"
        />
        <Nip05 pubkey={pubkey} />
        <div className="truncate text-muted-foreground text-sm">{profile?.metadata?.about}</div>
      </div>
      <div className="flex gap-2 items-center">
        {switching ? (
          <Button disabled variant="ghost" size="icon">
            <Loader className="animate-spin" />
          </Button>
        ) : muteType === 'private' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (switching) return
              setSwitching(true)
              mutePublicly(pubkey).finally(() => setSwitching(false))
            }}
            disabled={changing}
          >
            <Lock className="text-green-400" />
          </Button>
        ) : muteType === 'public' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (switching) return
              setSwitching(true)
              mutePrivately(pubkey).finally(() => setSwitching(false))
            }}
            disabled={changing}
          >
            <Unlock className="text-muted-foreground" />
          </Button>
        ) : null}
        <MuteButton pubkey={pubkey} />
      </div>
    </div>
  )
}
