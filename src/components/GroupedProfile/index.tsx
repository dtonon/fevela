import { useFetchProfile } from '@/hooks'
import GroupedProfileFeed from './GroupedProfileFeed'

export default function GroupedProfile({ id }: { id?: string }) {
  const { profile } = useFetchProfile(id)

  if (!profile) return null

  const { pubkey } = profile

  return <GroupedProfileFeed pubkey={pubkey} />
}
