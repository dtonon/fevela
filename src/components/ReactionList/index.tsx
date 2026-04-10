import { useSecondaryPage } from '@/PageManager'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { formatAmount } from '@/lib/lightning'
import { toProfile } from '@/lib/link'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { TEmoji, TFeedSubRequest } from '@/types'
import { Filter } from '@nostr/tools/filter'
import * as kinds from '@nostr/tools/kinds'
import { Event } from '@nostr/tools/wasm'
import { Repeat, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Content from '../Content'
import Emoji from '../Emoji'
import { FormattedTimestamp } from '../FormattedTimestamp'
import Nip05 from '../Nip05'
import UserAvatar from '../UserAvatar'
import Username from '../Username'

const SHOW_COUNT = 50
const LIMIT = 500

type TReactionItem =
  | {
      type: 'reaction'
      id: string
      pubkey: string
      created_at: number
      emoji: TEmoji | string
    }
  | {
      type: 'repost'
      id: string
      pubkey: string
      created_at: number
    }
  | {
      type: 'zap'
      id: string
      pubkey: string
      created_at: number
      amount: number
      comment?: string
    }

export default function ReactionList({
  event,
  selectedRelayUrls
}: {
  event: Event
  selectedRelayUrls: string[]
}) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { isSmallScreen } = useScreenSize()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const reactionItems = useMemo(() => {
    const items: TReactionItem[] = []

    const sortedEvents = events.sort((a, b) => b.created_at - a.created_at)
    for (let i = 0; i < sortedEvents.length; i++) {
      const evt = sortedEvents[i]
      if (hideUntrustedInteractions && !isUserTrusted(evt.pubkey)) continue

      switch (evt.kind) {
        case kinds.Reaction: {
          let emoji: TEmoji | string
          if (evt.content.startsWith(':') && evt.content.endsWith(':')) {
            const shortcode = evt.content.slice(1, -1)
            const emojiTag = evt.tags.find(
              ([tagName, tagShortcode]) => tagName === 'emoji' && tagShortcode === shortcode
            )
            emoji = emojiTag ? { url: emojiTag[2], shortcode } : '+'
          } else {
            emoji = evt.content
          }

          items.push({
            type: 'reaction',
            id: evt.id,
            pubkey: evt.pubkey,
            created_at: evt.created_at,
            emoji
          })
          break
        }

        case kinds.Repost: {
          items.push({
            type: 'repost',
            id: evt.id,
            pubkey: evt.pubkey,
            created_at: evt.created_at
          })

          break
        }

        case kinds.Zap: {
          const info = getZapInfoFromEvent(evt)
          if (info && info.senderPubkey) {
            items.push({
              type: 'zap',
              id: info.invoice,
              pubkey: info.senderPubkey,
              created_at: evt.created_at,
              amount: info.amount,
              comment: info.comment
            })
          }
        }
      }
    }

    return items
  }, [events, hideUntrustedInteractions, isUserTrusted])

  useEffect(() => {
    if (!bottomRef.current || reactionItems.length <= showCount) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShowCount((c) => c + SHOW_COUNT)
      },
      { rootMargin: '10px', threshold: 0.1 }
    )
    obs.observe(bottomRef.current)
    return () => obs.disconnect()
  }, [reactionItems.length, showCount])

  useEffect(() => {
    setShowCount(SHOW_COUNT)
  }, [event.id, selectedRelayUrls])

  useEffect(() => {
    let isCancelled = false
    ;(async () => {
      const replaceableCoordinate = isReplaceableEvent(event.kind)
        ? getReplaceableCoordinateFromEvent(event)
        : undefined

      const filters: Filter[] = [
        {
          '#e': [event.id],
          kinds: [kinds.Reaction, kinds.Repost, kinds.Zap],
          limit: LIMIT
        }
      ]

      if (replaceableCoordinate) {
        filters.push({
          '#a': [replaceableCoordinate],
          kinds: [kinds.Reaction, kinds.Repost, kinds.Zap],
          limit: LIMIT
        })
      }

      let relayUrls = selectedRelayUrls
      if (!selectedRelayUrls.length) {
        const relayList = await client.fetchRelayList(event.pubkey)
        relayUrls = relayList.read.concat(window.fevela.universe.bigRelayUrls)
      }

      if (isCancelled) return
      setSubRequests(
        filters.flatMap((filter) => [
          {
            source: 'relays',
            urls: relayUrls,
            filter
          },
          ...(!selectedRelayUrls.length
            ? [
                {
                  source: 'local',
                  filter
                } as TFeedSubRequest
              ]
            : [])
        ])
      )
    })()

    return () => {
      isCancelled = true
    }
  }, [event.id, event.kind, event.pubkey, selectedRelayUrls])

  useEffect(() => {
    if (subRequests.length === 0) return

    setLoading(true)
    setEvents([])

    const subc = client.subscribeTimeline(
      subRequests,
      {},
      {
        onEvents: (events, isFinal) => {
          if (isFinal) setLoading(false)
          if (events.length > 0) {
            setEvents(events)
          } else if (isFinal) {
            setEvents([])
          }
        },
        onNew: (evt) => {
          setEvents((oldEvents) => {
            if (oldEvents.some((existing) => existing.id === evt.id)) return oldEvents
            return [evt, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
          })
        }
      }
    )

    return () => subc.close()
  }, [subRequests])

  return (
    <div className="min-h-[80vh]">
      {reactionItems.slice(0, showCount).map((item) => {
        if (item.type === 'reaction') {
          return (
            <div
              key={item.id}
              title={item.id}
              className="px-4 py-3 border-b transition-colors clickable flex items-center gap-3"
              onClick={() => push(toProfile(item.pubkey))}
            >
              <div className="w-6 flex flex-col items-center">
                <Emoji
                  emoji={item.emoji}
                  classNames={{
                    text: 'text-xl'
                  }}
                />
              </div>

              <UserAvatar userId={item.pubkey} size="medium" className="shrink-0" />

              <div className="flex-1 w-0">
                <Username
                  userId={item.pubkey}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground max-w-fit truncate"
                  skeletonClassName="h-3"
                />
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Nip05 pubkey={item.pubkey} append="·" />
                  <FormattedTimestamp
                    timestamp={item.created_at}
                    className="shrink-0"
                    short={isSmallScreen}
                  />
                </div>
              </div>
            </div>
          )
        }

        if (item.type === 'repost') {
          return (
            <div
              key={item.id}
              className="px-4 py-3 border-b transition-colors clickable flex items-center gap-3"
              onClick={() => push(toProfile(item.pubkey))}
            >
              <Repeat className="text-green-400 size-5" />

              <UserAvatar userId={item.pubkey} size="medium" className="shrink-0" />

              <div className="flex-1 w-0">
                <Username
                  userId={item.pubkey}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground max-w-fit truncate"
                  skeletonClassName="h-3"
                />
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Nip05 pubkey={item.pubkey} append="·" />
                  <FormattedTimestamp
                    timestamp={item.created_at}
                    className="shrink-0"
                    short={isSmallScreen}
                  />
                </div>
              </div>
            </div>
          )
        }

        return (
          <div
            key={item.id}
            className="px-4 py-3 border-b transition-colors clickable flex gap-2"
            onClick={() => push(toProfile(item.pubkey))}
          >
            <div className="w-8 flex flex-col items-center mt-0.5">
              <Zap className="text-yellow-400 size-5" />
              <div className="text-sm font-semibold text-yellow-400">
                {formatAmount(item.amount)}
              </div>
            </div>

            <div className="flex space-x-2 items-start">
              <UserAvatar userId={item.pubkey} size="medium" className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <Username
                  userId={item.pubkey}
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground max-w-fit truncate"
                  skeletonClassName="h-3"
                />
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Nip05 pubkey={item.pubkey} append="·" />
                  <FormattedTimestamp
                    timestamp={item.created_at}
                    className="shrink-0"
                    short={isSmallScreen}
                  />
                </div>
                <Content className="mt-2" content={item.comment} />
              </div>
            </div>
          </div>
        )
      })}

      <div ref={bottomRef} />

      <div className="text-sm mt-2 text-center text-muted-foreground">
        {loading
          ? t('Loading')
          : reactionItems.length > 0
            ? t('No more reactions')
            : t('No reactions yet')}
      </div>
    </div>
  )
}
