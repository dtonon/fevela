import { useFetchProfile } from '@/hooks'
import { userIdToPubkey } from '@/lib/pubkey'
import { useMemo } from 'react'
import FollowButton from '../FollowButton'
import Nip05 from '../Nip05'
import ProfileAbout from '../ProfileAbout'
import { SimpleUserAvatar } from '../UserAvatar'
import { username } from '@/lib/event-metadata'

export default function ProfileCard({ userId }: { userId: string }) {
  const pubkey = useMemo(() => userIdToPubkey(userId), [userId])
  const { profile } = useFetchProfile(userId)
  const { about } = profile?.metadata || {}
  const name = profile ? username(profile) : '<unknown>'

  return (
    <div className="w-full flex flex-col gap-2 not-prose">
      <div className="flex space-x-2 w-full items-start justify-between">
        <SimpleUserAvatar userId={pubkey} className="w-12 h-12" />
        <FollowButton pubkey={pubkey} />
      </div>
      <div>
        <div className="text-lg font-semibold truncate">{name}</div>
        <Nip05 pubkey={pubkey} />
      </div>
      {about && (
        <ProfileAbout
          about={about}
          className="text-sm text-wrap break-words w-full overflow-hidden text-ellipsis line-clamp-6"
        />
      )}
    </div>
  )
}
