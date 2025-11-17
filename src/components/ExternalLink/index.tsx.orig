import { LINK_PREVIEW_MODE } from '@/constants'
import { truncateUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { useLinkPreviewHover } from '@/providers/LinkPreviewHoverProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { useMemo, useRef } from 'react'
import WebPreview from '../WebPreview'

export default function ExternalLink({ url, className }: { url: string; className?: string }) {
  const { linkPreviewMode } = useUserPreferences()
  const { isSmallScreen } = useScreenSize()
  const { startHover, updateCursorPosition, cancelHover, clickedUrls, toggleClickedUrl } =
    useLinkPreviewHover()
  const linkRef = useRef<HTMLAnchorElement>(null)
  const displayUrl = useMemo(() => truncateUrl(url), [url])

  const isClickMode = linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER && isSmallScreen
  const isClicked = clickedUrls.has(url)

  // Mouse handlers (desktop hover mode)
  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER && !isSmallScreen && linkRef.current) {
      startHover(url, { x: e.clientX, y: e.clientY }, linkRef.current)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER && !isSmallScreen) {
      updateCursorPosition({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseLeave = () => {
    if (linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER && !isSmallScreen) {
      cancelHover()
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation()

    // Mobile click mode
    if (isClickMode) {
      if (isClicked) {
        // Second click - allow navigation
        return
      } else {
        // First click - show preview, prevent navigation
        e.preventDefault()
        toggleClickedUrl(url)
      }
    }
  }

  return (
    <>
      <a
        ref={linkRef}
        className={cn('text-primary hover:underline', className)}
        href={url}
        target="_blank"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        rel="noreferrer"
      >
        {displayUrl}
      </a>
      {/* Inline preview on mobile click mode */}
      {isClickMode && isClicked && (
        <div className="mt-2">
          <WebPreview url={url} showFallback />
        </div>
      )}
    </>
  )
}
