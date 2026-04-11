import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import MediaUploadServiceSetting from './MediaUploadServiceSetting'
import ReadRepliesFromInboxesOnlySetting from './ReadRepliesFromInboxesOnlySetting'

const PostSettingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()

  return (
    <SecondaryPageLayout ref={ref} index={index} title={t('Protocol')}>
      <div className="px-4 pt-3 space-y-6">
        <MediaUploadServiceSetting />
        <ReadRepliesFromInboxesOnlySetting />
      </div>
    </SecondaryPageLayout>
  )
})
PostSettingsPage.displayName = 'PostSettingsPage'
export default PostSettingsPage
