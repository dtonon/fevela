import { getUsingClient } from '@/lib/event'
import { NostrEvent } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function ClientTag({ event }: { event: NostrEvent }) {
  const { t } = useTranslation()
  const usingClient = useMemo(() => getUsingClient(event), [event])

  if (!usingClient) return null

  return (
    <span className="text-sm text-muted-foreground shrink-0">
      {t('via {{client}}', { client: usingClient })}
    </span>
  )
}
