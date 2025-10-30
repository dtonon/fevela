import { LINK_PREVIEW_MODE } from '@/constants'
import { truncateUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { useLinkPreviewHover } from '@/providers/LinkPreviewHoverProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { useMemo, useRef } from 'react'

export default function ExternalLink({ url, className }: { url: string; className?: string }) {
  const { linkPreviewMode } = useUserPreferences()
  const { startHover, updateCursorPosition, cancelHover } = useLinkPreviewHover()
  const linkRef = useRef<HTMLAnchorElement>(null)
  const displayUrl = useMemo(() => truncateUrl(url), [url])

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER && linkRef.current) {
      startHover(url, { x: e.clientX, y: e.clientY }, linkRef.current)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER) {
      // Update cursor position for loading indicator to follow cursor
      updateCursorPosition({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseLeave = () => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER) {
      cancelHover()
    }
  }

  return (
    <a
      ref={linkRef}
      className={cn('text-primary hover:underline', className)}
      href={url}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      rel="noreferrer"
    >
      {displayUrl}
    </a>
  )
}
