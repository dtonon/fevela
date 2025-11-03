import { useFetchWebMetadata } from '@/hooks/useFetchWebMetadata'
import { cn } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useMemo } from 'react'
import Image from '../Image'

export default function WebPreview({
  url,
  className,
  variant = 'horizontal',
  showFallback = false
}: {
  url: string
  className?: string
  variant?: 'horizontal' | 'vertical'
  showFallback?: boolean
}) {
  const { autoLoadMedia } = useContentPolicy()
  const { isSmallScreen } = useScreenSize()
  const { title, description, image, isLoading } = useFetchWebMetadata(url)

  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }, [url])

  // Show loading skeleton while fetching
  if (showFallback && isLoading) {
    return (
      <div className={cn('rounded-lg border overflow-hidden bg-card p-4 animate-pulse', className)}>
        <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2"></div>
        <div className="h-3 bg-muted rounded w-full mb-1"></div>
        <div className="h-3 bg-muted rounded w-5/6"></div>
      </div>
    )
  }

  // Show fallback message only after loading is complete and preview failed
  const shouldShowFallback = showFallback && !isLoading && (!autoLoadMedia || !title)

  if (shouldShowFallback) {
    return (
      <div
        className={cn(
          'rounded-lg border overflow-hidden bg-card p-4 text-center text-muted-foreground',
          className
        )}
      >
        Sorry, no preview available
      </div>
    )
  }

  // While loading or if no preview yet, return null
  if (isLoading || !autoLoadMedia || !title) {
    return null
  }

  // Vertical layout (for popups)
  if (variant === 'vertical') {
    return (
      <div
        className={cn('rounded-lg border overflow-hidden bg-card', className)}
        onClick={(e) => {
          e.stopPropagation()
          window.open(url, '_blank')
        }}
      >
        <div className="p-3">
          <div className="text-xs text-muted-foreground mb-1">{hostname}</div>
          <div className="font-semibold line-clamp-2 mb-1">{title}</div>
          <div className="text-sm text-muted-foreground line-clamp-3">{description}</div>
        </div>
        {image && <Image image={{ url: image }} className="w-full h-48 rounded-none" hideIfError />}
      </div>
    )
  }

  // Small screen layout (vertical)
  if (isSmallScreen && image) {
    return (
      <div
        className="rounded-lg border mt-2 overflow-hidden"
        onClick={(e) => {
          e.stopPropagation()
          window.open(url, '_blank')
        }}
      >
        <Image image={{ url: image }} className="w-full h-44 rounded-none" hideIfError />
        <div className="bg-muted p-2 w-full">
          <div className="text-xs text-muted-foreground">{hostname}</div>
          <div className="font-semibold line-clamp-1">{title}</div>
        </div>
      </div>
    )
  }

  // Horizontal layout (default)
  return (
    <div
      className={cn('p-0 clickable flex w-full border rounded-lg overflow-hidden', className)}
      onClick={(e) => {
        e.stopPropagation()
        window.open(url, '_blank')
      }}
    >
      {image && (
        <Image
          image={{ url: image }}
          className="aspect-[4/3] xl:aspect-video bg-foreground h-44 rounded-none"
          hideIfError
        />
      )}
      <div className="flex-1 w-0 p-2">
        <div className="text-xs text-muted-foreground">{hostname}</div>
        <div className="font-semibold line-clamp-2">{title}</div>
        <div className="text-xs text-muted-foreground line-clamp-5">{description}</div>
      </div>
    </div>
  )
}
