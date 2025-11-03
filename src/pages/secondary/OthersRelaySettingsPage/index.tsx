import OthersRelayList from '@/components/OthersRelayList'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { username } from '@/lib/event-metadata'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

const RelaySettingsPage = forwardRef(({ id, index }: { id?: string; index?: number }, ref) => {
  const { t } = useTranslation()
  const { profile } = useFetchProfile(id)

  if (!id || !profile) {
    return null
  }

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={t("username's used relays", { username: username(profile) })}
    >
      <div className="px-4 pt-3">
        <OthersRelayList userId={id} />
      </div>
    </SecondaryPageLayout>
  )
})
RelaySettingsPage.displayName = 'RelaySettingsPage'
export default RelaySettingsPage
