import { useFetchProfile } from '@/hooks'
import FollowButton from '../FollowButton'
import Nip05 from '../Nip05'
import ProfileAbout from '../ProfileAbout'
import { SimpleUserAvatar } from '../UserAvatar'
import { username } from '@/lib/event-metadata'

export default function ProfileCard({ userId }: { userId: string }) {
  const { profile } = useFetchProfile(userId)
  const name = profile ? username(profile) : '<unknown>'

  if (!profile) return null

  return (
    <div className="w-full flex flex-col gap-2 not-prose">
      <div className="flex space-x-2 w-full items-start justify-between">
        <SimpleUserAvatar userId={profile.pubkey} profile={profile} className="w-12 h-12" />
        <FollowButton pubkey={profile.pubkey} />
      </div>
      <div>
        <div className="text-lg font-semibold truncate">{name}</div>
        <Nip05 pubkey={profile.pubkey} profile={profile} />
      </div>
      {profile.metadata.about && (
        <ProfileAbout
          about={profile.metadata.about}
          className="text-sm text-wrap break-words w-full overflow-hidden text-ellipsis line-clamp-6"
        />
      )}
    </div>
  )
}
