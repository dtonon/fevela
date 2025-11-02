import { ExtendedKind } from '@/constants'
import { tagNameEquals } from '@/lib/tag'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function IValue({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const iValue = useMemo(() => {
    if (event.kind !== ExtendedKind.COMMENT) return undefined
    const iTag = event.tags.find(tagNameEquals('i'))
    return iTag ? iTag[1] : undefined
  }, [event])

  if (!iValue) return null

  return (
    <div className={cn('truncate text-muted-foreground', className)}>
      {t('Comment on') + ' '}
      {iValue.startsWith('http') ? (
        <a
          className="hover:text-foreground underline truncate"
          href={iValue}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {iValue}
        </a>
      ) : (
        <span>{iValue}</span>
      )}
    </div>
  )
}
