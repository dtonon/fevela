import GroupedProfile from '@/components/GroupedProfile'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { username } from '@/lib/event-metadata'
import { toProfile } from '@/lib/link'
import { SecondaryPageLink } from '@/PageManager'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

const GroupedProfilePage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { profile } = useFetchProfile(id)
  const { t } = useTranslation()

  return (
    <SecondaryPageLayout
      index={index}
      title={profile ? username(profile) : ''}
      displayScrollToTopButton
      ref={ref}
      controls={
        profile && (
          <SecondaryPageLink
            to={toProfile(profile.pubkey)}
            className="text-primary hover:underline text-sm pr-4"
          >
            {t('Show all content')}
          </SecondaryPageLink>
        )
      }
    >
      <GroupedProfile id={id} />
    </SecondaryPageLayout>
  )
})
GroupedProfilePage.displayName = 'GroupedProfilePage'
export default GroupedProfilePage
