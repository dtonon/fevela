import ProfileList from '@/components/ProfileList'
import { useFetchFollowings, useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { username } from '@/lib/event-metadata'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

const FollowingListPage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { t } = useTranslation()
  const { profile } = useFetchProfile(id)
  const { followings } = useFetchFollowings(profile?.pubkey)

  if (!profile) return null

  const name = username(profile)

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={name ? t("username's following", { username: name }) : t('Following')}
      displayScrollToTopButton
    >
      <ProfileList pubkeys={followings} />
    </SecondaryPageLayout>
  )
})
FollowingListPage.displayName = 'FollowingListPage'
export default FollowingListPage
