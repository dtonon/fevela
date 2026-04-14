import { Switch } from '@/components/ui/switch'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { useTranslation } from 'react-i18next'

export default function ReadRepliesFromInboxesOnlySetting() {
  const { t } = useTranslation()
  const { readRepliesFromInboxesOnly, updateReadRepliesFromInboxesOnly } = useUserPreferences()

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium">{t('Read replies from inboxes only')}</div>
      <Switch
        checked={readRepliesFromInboxesOnly}
        onCheckedChange={updateReadRepliesFromInboxesOnly}
      />
    </div>
  )
}
