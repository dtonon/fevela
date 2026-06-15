import { tagNameEquals } from '@/lib/tag'
import { normalizeHttpUrl, simplifyUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function WebBookmarkPreview({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()
  const title = useMemo(() => event.tags.find(tagNameEquals('title'))?.[1], [event])
  const dTag = useMemo(() => event.tags.find(tagNameEquals('d'))?.[1] ?? '', [event])
  const label = title?.trim() || simplifyUrl(normalizeHttpUrl(dTag) || dTag)

  return (
    <div className={cn('pointer-events-none', className)}>
      [{t('Bookmark')}] <span className="italic pr-0.5">{label}</span>
    </div>
  )
}
