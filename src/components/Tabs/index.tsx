import { cn } from '@/lib/utils'
import { useDeepBrowsing } from '@/providers/DeepBrowsingProvider'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea, ScrollBar } from '../ui/scroll-area'

export type TTabDefinition = {
  value: string
  label: string
}

export default function Tabs({
  tabs,
  value,
  onTabChange,
  threshold = 800,
  options = null,
  hideTabs = false
}: {
  tabs: TTabDefinition[]
  value: string
  onTabChange?: (tab: string) => void
  threshold?: number
  options?: ReactNode
  hideTabs?: boolean
}) {
  const { t } = useTranslation()
  const { deepBrowsing, lastScrollTop } = useDeepBrowsing()
  const tabRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 })

  const updateIndicatorPosition = () => {
    const activeIndex = tabs.findIndex((tab) => tab.value === value)
    if (activeIndex >= 0 && tabRefs.current[activeIndex]) {
      const activeTab = tabRefs.current[activeIndex]
      const { offsetWidth, offsetLeft } = activeTab
      const padding = 24 // 12px padding on each side
      setIndicatorStyle({
        width: offsetWidth - padding,
        left: offsetLeft + padding / 2
      })
    }
  }

  useEffect(() => {
    const animationId = requestAnimationFrame(() => {
      updateIndicatorPosition()
    })

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [tabs, value])

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      updateIndicatorPosition()
    })

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            requestAnimationFrame(() => {
              updateIndicatorPosition()
            })
          }
        })
      },
      { threshold: 0 }
    )

    intersectionObserver.observe(containerRef.current)

    tabRefs.current.forEach((tab) => {
      if (tab) resizeObserver.observe(tab)
    })

    return () => {
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
    }
  }, [tabs, value])

  return (
    <div
      ref={containerRef}
      className={cn(
        'sticky flex justify-between top-12 bg-background z-30 px-1 w-full transition-transform border-b',
        deepBrowsing && lastScrollTop > threshold ? '-translate-y-[calc(100%+12rem)]' : '',
        hideTabs && 'justify-end' // Right-align options when tabs are hidden
      )}
    >
      {!hideTabs && (
        <ScrollArea className="flex-1 w-0 min-w-36">
          <div className="flex w-fit relative">
            {tabs.map((tab, index) => (
              <div
                key={tab.value}
                ref={(el) => (tabRefs.current[index] = el)}
                className={cn(
                  `w-fit text-center py-2 px-1 sm:px-2 lg:px-4 my-1 font-semibold whitespace-nowrap clickable cursor-pointer rounded-lg`,
                  value === tab.value ? '' : 'text-muted-foreground'
                )}
                onClick={() => {
                  onTabChange?.(tab.value)
                }}
              >
                {t(tab.label)}
              </div>
            ))}
            <div
              className="absolute bottom-0 h-1 bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${indicatorStyle.width}px`,
                left: `${indicatorStyle.left}px`
              }}
            />
          </div>
          <ScrollBar orientation="horizontal" className="opacity-0 pointer-events-none" />
        </ScrollArea>
      )}
      {options && <div className="py-1 flex items-center">{options}</div>}
    </div>
  )
}
