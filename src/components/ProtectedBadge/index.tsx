import { isProtectedEvent } from '@/lib/event'
import { Event } from '@nostr/tools/wasm'
import { useTranslation } from 'react-i18next'

export default function ProtectedBadge({ event }: { event: Event }) {
  const { t } = useTranslation()

  if (!isProtectedEvent(event)) return null

  return (
    <div
      className="rounded-full bg-green-500/10 px-2 py-0.5 flex items-center"
      title={t('Protected event (NIP-70)')}
    >
      <span className="text-xs leading-none text-green-600 dark:text-green-400">
        {t('Protected')}
      </span>
    </div>
  )
}
