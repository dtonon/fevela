import Profile from '@/components/Profile'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef, useEffect, useState } from 'react'

const ProfilePage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { profile } = useFetchProfile(id)
  const [hideTopSection, setHideTopSection] = useState(false)
  const [sinceTimestamp, setSinceTimestamp] = useState<number | undefined>(undefined)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const hideTop = searchParams.get('hideTop') === 'true'
    const since = searchParams.get('since')
    setHideTopSection(hideTop)
    setSinceTimestamp(since ? parseInt(since, 10) : undefined)
  }, [])

  return (
    <SecondaryPageLayout index={index} title={profile?.username} displayScrollToTopButton ref={ref}>
      <Profile id={id} hideTopSection={hideTopSection} sinceTimestamp={sinceTimestamp} />
    </SecondaryPageLayout>
  )
})
ProfilePage.displayName = 'ProfilePage'
export default ProfilePage
