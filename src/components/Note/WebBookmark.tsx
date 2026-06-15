import { tagNameEquals } from '@/lib/tag'
import { normalizeHttpUrl, simplifyUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import Content from '../Content'

export default function WebBookmark({ event, className }: { event: Event; className?: string }) {
  const dTag = useMemo(() => event.tags.find(tagNameEquals('d'))?.[1] ?? '', [event])
  const title = useMemo(() => event.tags.find(tagNameEquals('title'))?.[1], [event])
  const publishedAt = useMemo(() => event.tags.find(tagNameEquals('published_at'))?.[1], [event])
  const url = useMemo(() => normalizeHttpUrl(dTag), [dTag])
  const displayTitle = title?.trim() || simplifyUrl(url || dTag)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm text-muted-foreground font-medium">Web Bookmark</div>
      {displayTitle && (
        <div className="min-w-0">
          {url ? (
            <a
              className="font-medium text-base break-words text-primary hover:underline"
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {displayTitle}
            </a>
          ) : (
            <div className="font-medium break-words">{displayTitle}</div>
          )}
          {displayTitle !== simplifyUrl(url || dTag) && url && (
            <div className="text-sm text-muted-foreground truncate">{simplifyUrl(url)}</div>
          )}
        </div>
      )}
      {publishedAt && <div className="text-sm text-muted-foreground">{publishedAt}</div>}
      {event.content && (
        <Content className="text-wrap break-words whitespace-pre-wrap" event={event} />
      )}
    </div>
  )
}
