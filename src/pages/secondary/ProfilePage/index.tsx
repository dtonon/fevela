import Profile from '@/components/Profile'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { username } from '@/lib/event-metadata'
import { forwardRef } from 'react'

const ProfilePage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { profile } = useFetchProfile(id)

  return (
    <SecondaryPageLayout
      index={index}
      title={profile ? username(profile) : ''}
      displayScrollToTopButton
      ref={ref}
    >
      <Profile id={id} />
    </SecondaryPageLayout>
  )
})
ProfilePage.displayName = 'ProfilePage'
export default ProfilePage
