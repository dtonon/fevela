import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import {
  getEventKey,
  getEventKeyFromTag,
  getParentTag,
  getRootTag,
  isMentioningMutedUsers,
  isReplyNoteEvent
} from '@/lib/event'
import { toNote } from '@/lib/link'
import { generateBech32IdFromATag, generateBech32IdFromETag } from '@/lib/tag'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { Filter } from '@nostr/tools/filter'
import { Event as NEvent } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingBar } from '../LoadingBar'
import ReplyNote, { ReplyNoteSkeleton } from '../ReplyNote'
import { SubCloser } from '@nostr/tools/abstract-pool'
import { TFeedSubRequest } from '@/types'

const LIMIT = 100
const SHOW_COUNT = 10

export default function ReplyNoteList({
  index,
  event,
  showOnlyFirstLevel = false
}: {
  index?: number
  event: NEvent
  showOnlyFirstLevel?: boolean
}) {
  const { t } = useTranslation()
  const { push, currentIndex } = useSecondaryPage()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const { repliesMap, addReplies } = useReply()
  const replies = useMemo(() => {
    const replyKeySet = new Set<string>()
    const replyEvents: NEvent[] = []
    const currentEventKey = getEventKey(event)
    let parentEventKeys = [currentEventKey]

    // If showOnlyFirstLevel is true, only get direct replies
    const maxDepth = showOnlyFirstLevel ? 1 : Infinity
    let depth = 0

    while (parentEventKeys.length > 0 && depth < maxDepth) {
      const events = parentEventKeys.flatMap((key) => repliesMap.get(key)?.events || [])
      events.forEach((evt) => {
        const key = getEventKey(evt)
        if (replyKeySet.has(key)) return
        if (mutePubkeySet.has(evt.pubkey)) return
        if (hideContentMentioningMutedUsers && isMentioningMutedUsers(evt, mutePubkeySet)) return

        replyKeySet.add(key)
        replyEvents.push(evt)
      })
      parentEventKeys = events.map((evt) => getEventKey(evt))
      depth++
    }
    return replyEvents.sort((a, b) => a.created_at - b.created_at)
  }, [event.id, repliesMap, showOnlyFirstLevel])
  const [until, setUntil] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [highlightReplyKey, setHighlightReplyKey] = useState<string | undefined>(undefined)
  const replyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ;(async () => {
      let rootTag = getRootTag(event)
      if (!rootTag) {
        // if nothing is found that means the current event is the root,
        // so we fake some tags here to represent that:
        rootTag =
          event.kind === 1
            ? ['e', event.id, '', '', event.pubkey]
            : ['E', event.id, '', event.pubkey]
      }

      const filters: Filter[] = []
      const relays: string[] = client.getSeenEventRelayUrls(event.id, event)

      const hint = rootTag[2]
      if (hint) relays.push(hint)

      switch (rootTag[0]) {
        case 'e':
          filters.push({
            '#e': [rootTag[1]],
            kinds: [kinds.ShortTextNote]
          })
        // eslint-disable-next-line no-fallthrough
        case 'E':
          filters.push({
            '#E': [rootTag[1]],
            kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT]
          })

          const authorHint = event.kind === 1 ? rootTag[4] : rootTag[3]
          try {
            const author =
              authorHint || (await client.fetchEvent(generateBech32IdFromETag(rootTag)!))?.pubkey
            if (author) {
              relays.push(...(await client.fetchRelayList(author)).read)
            }
          } catch (_err) {
            /***/
          }

          break
        case 'A':
        case 'a':
          filters.push(
            {
              '#a': [rootTag[1]],
              kinds: [kinds.ShortTextNote]
            },
            {
              '#A': [rootTag[1]],
              kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT]
            }
          )

          const author = rootTag[1].split(':')[1]
          relays.push(...(await client.fetchRelayList(author)).read)
          break
        default:
          filters.push({
            '#I': [rootTag[1]],
            kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT]
          })
      }

      setSubRequests(
        filters.map((filter) => ({
          source: 'relays',
          urls: relays.concat(BIG_RELAY_URLS).slice(0, 5),
          filter
        }))
      )
    })()
  }, [event])

  useEffect(() => {
    if (loading || subRequests.length === 0 || currentIndex !== index) return

    setLoading(true)

    let subc: SubCloser | undefined
    try {
      subc = client.subscribeTimeline(
        subRequests,
        {
          limit: LIMIT
        },
        {
          onEvents: (evts) => {
            if (evts.length > 0) {
              addReplies(evts.filter(isReplyNoteEvent))
            }
            setUntil(evts.length >= LIMIT ? evts[evts.length - 1].created_at - 1 : undefined)
            setLoading(false)
          },
          onNew: (evt) => {
            if (!isReplyNoteEvent(evt)) return
            addReplies([evt])
          }
        }
      )
    } catch (_err) {
      setLoading(false)
    }

    return () => subc?.close?.()
  }, [subRequests, currentIndex, index])

  useEffect(() => {
    if (replies.length === 0) {
      loadMore()
    }
  }, [replies])

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && showCount < replies.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
      }
    }, options)

    const currentBottomRef = bottomRef.current

    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }

    return () => {
      if (observerInstance && currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }
  }, [replies, showCount])

  async function loadMore() {
    if (loading || !until) return

    setLoading(true)
    const events = await client.loadMoreTimeline(subRequests, { until, limit: LIMIT })
    const olderEvents = events.filter((evt) => isReplyNoteEvent(evt))
    if (olderEvents.length > 0) {
      addReplies(olderEvents)
    }
    setUntil(events.length ? events[events.length - 1].created_at - 1 : undefined)
    setLoading(false)
  }

  const highlightReply = useCallback((key: string, eventId?: string, scrollTo = true) => {
    let found = false
    if (scrollTo) {
      const ref = replyRefs.current[key]
      if (ref) {
        found = true
        ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
    if (!found) {
      if (eventId) push(toNote(eventId))
      return
    }

    setHighlightReplyKey(key)
    setTimeout(() => {
      setHighlightReplyKey((pre) => (pre === key ? undefined : pre))
    }, 1500)
  }, [])

  return (
    <div className="min-h-[80vh]">
      {loading && <LoadingBar />}
      {!loading && until && until > event.created_at && (
        <div
          className={`text-sm text-center text-muted-foreground border-b py-2 ${!loading ? 'hover:text-foreground cursor-pointer' : ''}`}
          onClick={loadMore}
        >
          {t('load more older replies')}
        </div>
      )}
      <div>
        {replies.slice(0, showCount).map((reply) => {
          if (hideUntrustedInteractions && !isUserTrusted(reply.pubkey)) {
            const replyKey = getEventKey(reply)
            const repliesForThisReply = repliesMap.get(replyKey)
            // If the reply is not trusted and there are no trusted replies for this reply, skip rendering
            if (
              !repliesForThisReply ||
              repliesForThisReply.events.every((evt) => !isUserTrusted(evt.pubkey))
            ) {
              return null
            }
          }

          const rootEventKey = getEventKey(event)
          const currentReplyKey = getEventKey(reply)
          const parentTag = getParentTag(reply)
          const parentEventKey = parentTag ? getEventKeyFromTag(parentTag.tag) : undefined
          const parentEventId = parentTag
            ? parentTag.type === 'e'
              ? generateBech32IdFromETag(parentTag.tag)
              : generateBech32IdFromATag(parentTag.tag)
            : undefined
          return (
            <div
              ref={(el) => (replyRefs.current[currentReplyKey] = el)}
              key={currentReplyKey}
              className="scroll-mt-12"
            >
              <ReplyNote
                event={reply}
                parentEventId={rootEventKey !== parentEventKey ? parentEventId : undefined}
                onClickParent={() => {
                  if (!parentEventKey) return
                  highlightReply(parentEventKey, parentEventId)
                }}
                highlight={highlightReplyKey === currentReplyKey}
              />
            </div>
          )
        })}
      </div>
      {!loading && (
        <div className="text-sm mt-2 mb-3 text-center text-muted-foreground">
          {replies.length > 0 ? t('no more replies') : t('no replies')}
        </div>
      )}
      <div ref={bottomRef} />
      {loading && <ReplyNoteSkeleton />}
    </div>
  )
}
