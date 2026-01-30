import { useFetchProfile } from '@/hooks'
import NotFound from '../NotFound'
import GroupedProfileFeed from './GroupedProfileFeed'

export default function GroupedProfile({ id }: { id?: string }) {
  const { profile, isFetching } = useFetchProfile(id)

  if (!profile && isFetching) {
    return null
  }

  if (!profile) return <NotFound />

  const { pubkey } = profile

  return <GroupedProfileFeed pubkey={pubkey} />
}
