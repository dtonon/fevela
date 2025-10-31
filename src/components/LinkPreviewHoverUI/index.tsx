import { useLinkPreviewHover } from '@/providers/LinkPreviewHoverProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import WebPreview from '../WebPreview'

export default function LinkPreviewHoverUI() {
  const { activeUrl, cursorPosition, linkElement, showLoading, showPreview } =
    useLinkPreviewHover()
  const { isSmallScreen } = useScreenSize()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Only show popup on desktop (not mobile)
  if (!mounted || isSmallScreen) return null

  return createPortal(
    <>
      {/* Loading indicator */}
      {showLoading && cursorPosition && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: cursorPosition.x,
            top: cursorPosition.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <style>{`
            @keyframes gentle-pulse {
              0%, 100% { transform: scale(1); opacity: 0.3; }
              50% { transform: scale(1.3); opacity: 0.5; }
            }
          `}</style>
          <div
            className="w-6 h-6 rounded-full bg-primary"
            style={{ animation: 'gentle-pulse 1.5s ease-in-out infinite' }}
          />
        </div>
      )}

      {/* Preview popup */}
      {showPreview && activeUrl && linkElement && (
        <LinkPreviewPopup url={activeUrl} linkElement={linkElement} />
      )}
    </>,
    document.body
  )
}

function LinkPreviewPopup({ url, linkElement }: { url: string; linkElement: HTMLElement }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updatePosition = () => {
      if (!previewRef.current) return

      const rect = linkElement.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const previewHeight = previewRef.current.offsetHeight
      const previewWidth = 500 // Width of preview

      // Position below the link if there's space, otherwise above
      const spaceBelow = viewportHeight - rect.bottom
      const top = spaceBelow > previewHeight + 16 ? rect.bottom + 8 : rect.top - previewHeight - 8

      setPosition({
        top,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - previewWidth - 16)) // Keep within viewport with padding
      })
    }

    // Initial position calculation
    updatePosition()

    // Recalculate after a short delay to account for content rendering
    const timeoutId = setTimeout(updatePosition, 100)

    return () => clearTimeout(timeoutId)
  }, [linkElement])

  return (
    <div
      ref={previewRef}
      className="fixed z-[9998] w-[500px] max-w-[calc(100vw-32px)] transition-opacity duration-300 ease-in-out opacity-0 animate-[fadeIn_0.3s_ease-in-out_forwards]"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden'
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <WebPreview url={url} variant="vertical" className="shadow-lg border-2" />
    </div>
  )
}
