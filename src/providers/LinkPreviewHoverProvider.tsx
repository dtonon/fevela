import { createContext, useContext, useRef, useState } from 'react'

type TLinkPreviewHoverContext = {
  activeUrl: string | null
  cursorPosition: { x: number; y: number } | null
  linkElement: HTMLElement | null
  showLoading: boolean
  showPreview: boolean
  startHover: (url: string, cursorPos: { x: number; y: number }, element: HTMLElement) => void
  updateCursorPosition: (cursorPos: { x: number; y: number }) => void
  cancelHover: () => void
}

const LinkPreviewHoverContext = createContext<TLinkPreviewHoverContext | undefined>(undefined)

export const useLinkPreviewHover = () => {
  const context = useContext(LinkPreviewHoverContext)
  if (!context) {
    throw new Error('useLinkPreviewHover must be used within a LinkPreviewHoverProvider')
  }
  return context
}

export function LinkPreviewHoverProvider({ children }: { children: React.ReactNode }) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)
  const [linkElement, setLinkElement] = useState<HTMLElement | null>(null)
  const [showLoading, setShowLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null)

  const cancelHover = () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    setActiveUrl(null)
    setCursorPosition(null)
    setLinkElement(null)
    setShowLoading(false)
    setShowPreview(false)
  }

  const updateCursorPosition = (cursorPos: { x: number; y: number }) => {
    setCursorPosition(cursorPos)
  }

  const startHover = (url: string, cursorPos: { x: number; y: number }, element: HTMLElement) => {
    // Only cancel and restart if it's a different URL
    if (activeUrl === url) {
      return
    }

    // Cancel any existing hover
    cancelHover()

    setActiveUrl(url)
    setCursorPosition(cursorPos)
    setLinkElement(element)

    // Show loading indicator after 200ms
    loadingTimerRef.current = setTimeout(() => {
      setShowLoading(true)
    }, 400)

    // Show preview after 700ms (200 + 500)
    previewTimerRef.current = setTimeout(() => {
      setShowLoading(false)
      setShowPreview(true)
    }, 1000)
  }

  return (
    <LinkPreviewHoverContext.Provider
      value={{
        activeUrl,
        cursorPosition,
        linkElement,
        showLoading,
        showPreview,
        startHover,
        updateCursorPosition,
        cancelHover
      }}
    >
      {children}
    </LinkPreviewHoverContext.Provider>
  )
}
