import { useNoteStatsById } from '@/hooks/useNoteStatsById'
import { createReactionDraftEvent } from '@/lib/draft-event'
import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { TEmoji } from '@/types'
import { Loader } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Emoji from '../Emoji'

export default function Likes({ event }: { event: Event }) {
  const { pubkey, checkLogin, publish } = useNostr()
  const { isSmallScreen } = useScreenSize()
  const noteStats = useNoteStatsById(event.id)
  const [liking, setLiking] = useState<string | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const halfwayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [isLongPressing, setIsLongPressing] = useState<string | null>(null)
  const [ringPosition, setRingPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const buttonRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [isExploding, setIsExploding] = useState(false)

  const likes = useMemo(() => {
    const _likes = noteStats?.likes
    if (!_likes) return []

    const stats = new Map<string, { key: string; emoji: TEmoji | string; pubkeys: Set<string> }>()
    _likes.forEach((item) => {
      const key = typeof item.emoji === 'string' ? item.emoji : item.emoji.url
      if (!stats.has(key)) {
        stats.set(key, { key, pubkeys: new Set(), emoji: item.emoji })
      }
      stats.get(key)?.pubkeys.add(item.pubkey)
    })
    return Array.from(stats.values()).sort((a, b) => b.pubkeys.size - a.pubkeys.size)
  }, [noteStats, event])

  if (!likes.length) return null

  const like = async (key: string, emoji: TEmoji | string) => {
    checkLogin(async () => {
      if (liking || !pubkey) return

      setLiking(key)
      const timer = setTimeout(() => setLiking((prev) => (prev === key ? null : prev)), 5000)

      try {
        const reaction = createReactionDraftEvent(event, emoji)
        const seenOn = client.getSeenEventRelayUrls(event.id, event)
        const evt = await publish(reaction, { additionalRelayUrls: seenOn })
        noteStatsService.updateNoteStatsByEvents([evt])
      } catch (error) {
        console.error('like failed', error)
      } finally {
        setLiking(null)
        clearTimeout(timer)
      }
    })
  }

  const handleMouseDown = (key: string) => {
    if (pubkey && likes.find((l) => l.key === key)?.pubkeys.has(pubkey)) {
      return
    }

    // Get button position for ring portal
    const buttonElement = buttonRefs.current.get(key)
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect()
      setRingPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      })
    }

    // Initial haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }

    setIsLongPressing(key)

    // Halfway haptic feedback
    halfwayTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) {
        navigator.vibrate(30)
      }
    }, 400)

    // Complete and fire reaction
    longPressTimerRef.current = setTimeout(() => {
      const emoji = likes.find((l) => l.key === key)?.emoji
      if (emoji) {
        // Final haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate([50, 50, 50])
        }
        like(key, emoji)

        // Trigger explosion effect
        setIsLongPressing(null)
        setIsExploding(true)

        // Clean up after explosion animation
        setTimeout(() => {
          setIsExploding(false)
          setRingPosition(null)
        }, 400)
      }
    }, 800)
  }

  const handleMouseUp = () => {
    if (isExploding) return // Don't interrupt explosion

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (halfwayTimerRef.current) {
      clearTimeout(halfwayTimerRef.current)
      halfwayTimerRef.current = null
    }

    setIsLongPressing(null)
    setRingPosition(null)
  }

  const handleMouseLeave = () => {
    if (isExploding) return // Don't interrupt explosion

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (halfwayTimerRef.current) {
      clearTimeout(halfwayTimerRef.current)
      halfwayTimerRef.current = null
    }
    setIsLongPressing(null)
    setRingPosition(null)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const isInside =
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom

    if (!isInside) {
      handleMouseLeave()
    }
  }

  return (
    <>
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 py-2">
          {likes.map(({ key, emoji, pubkeys }) => (
            <div
              key={key}
              ref={(el) => {
                if (isSmallScreen && el) buttonRefs.current.set(key, el)
                else buttonRefs.current.delete(key)
              }}
              className={cn(
                'flex h-7 w-fit gap-2 px-2 rounded-full items-center border shrink-0 select-none relative overflow-hidden transition-all duration-200',
                pubkey && pubkeys.has(pubkey)
                  ? 'border-primary bg-primary/20 text-foreground cursor-not-allowed'
                  : 'bg-muted/80 text-muted-foreground cursor-pointer hover:bg-primary/40 hover:border-primary hover:text-foreground',
                isLongPressing === key && 'border-primary bg-primary/20'
              )}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={() => handleMouseDown(key)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={() => handleMouseDown(key)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseLeave}
            >
              {isLongPressing === key && (
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/80"
                    style={{
                      width: '0%',
                      animation: 'progressFill 1000ms ease-out forwards'
                    }}
                  />
                </div>
              )}
              <div className="relative z-10 flex items-center gap-2">
                {liking === key ? (
                  <Loader className="animate-spin size-4" />
                ) : (
                  <Emoji emoji={emoji} classNames={{ img: 'size-4' }} />
                )}
                <div className="text-sm">{pubkeys.size}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ring portal - mobile only */}
      {isSmallScreen && (isLongPressing || isExploding) && ringPosition && createPortal(
        <div
          style={{
            position: 'fixed',
            top: ringPosition.top - 60,
            left: ringPosition.left - 60,
            width: ringPosition.width + 120,
            height: ringPosition.height + 120,
            pointerEvents: 'none',
            zIndex: 9999,
            animation: isExploding ? 'ringExplode 400ms ease-out forwards' : undefined
          }}
        >
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="7"
              opacity="0.2"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="251"
              strokeDashoffset={isExploding ? "0" : "251"}
              style={{
                animation: isLongPressing && !isExploding ? 'radialProgress 800ms linear forwards' : undefined,
                transform: 'rotate(-90deg)',
                transformOrigin: '50px 50px'
              }}
            />
          </svg>
        </div>,
        document.body
      )}
    </>
  )
}
