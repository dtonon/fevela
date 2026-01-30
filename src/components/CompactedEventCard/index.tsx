import { parse } from '@nostr/tools/nip27'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { isMentioningMutedUsers, isReplyNoteEvent } from '@/lib/event'
import { tagNameEquals } from '@/lib/tag'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { Event, verifyEvent } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { neventEncode, nprofileEncode, npubEncode } from '@nostr/tools/nip19'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Collapsible from '../Collapsible'
import { FormattedTimestamp } from '../FormattedTimestamp'
import UserAvatar from '../UserAvatar'
import Username, { SimpleUsername } from '../Username'
import { useSecondaryPage } from '@/PageManager'
import { toNote, toGroupedProfile } from '@/lib/link'
import PinBuryBadge from '../PinBuryBadge'
import CompactModeMenu from '../CompactModeMenu'
import { username } from '@/lib/event-metadata'
import { Repeat2, Sparkles } from 'lucide-react'
import { truncateUrl } from '@/lib/url'

const maxLength = 150

export default function CompactedEventCard({
  event,
  className,
  totalNotesInTimeframe,
  variant = 'note',
  filterMutedNotes = true,
  isSelected = false,
  onSelect,
  onLastNoteRead,
  onAllNotesRead,
  onMarkAsUnread,
  isLastNoteRead = false,
  areAllNotesRead = false,
  relevanceScore
}: {
  event: Event
  className?: string
  totalNotesInTimeframe: number
  variant?: 'note' | 'repost'
  filterMutedNotes?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onLastNoteRead?: () => void
  onAllNotesRead?: () => void
  onMarkAsUnread?: () => void
  isLastNoteRead?: boolean
  areAllNotesRead?: boolean
  relevanceScore?: number
}) {
  const { push } = useSecondaryPage()
  const { t } = useTranslation()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const { settings: groupedNotesSettings } = useGroupedNotes()
  const [targetEvent, setTargetEvent] = useState<Event | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)

  const isRepost = variant === 'repost'
  const isReply = !isRepost && isReplyNoteEvent(event)

  const shouldShowPreview = groupedNotesSettings.compactedView && groupedNotesSettings.showPreview

  // Generate preview text asynchronously
  useEffect(() => {
    if (!shouldShowPreview) return

    // Reset preview when event changes
    setPreviewText(null)

    const generatePreview = async () => {
      // For reposts, wait until targetEvent is loaded
      if (isRepost && !targetEvent) return

      const eventToPreview = isRepost && targetEvent ? targetEvent : event
      const preview = await getPreviewText(eventToPreview)
      setPreviewText(preview)
    }
    generatePreview()

    // Timeout for reposts that fail to load
    if (isRepost && !targetEvent) {
      const timeoutId = setTimeout(() => {
        setPreviewText(t('Missing preview'))
      }, 5000)

      return () => clearTimeout(timeoutId)
    }
  }, [event, isRepost, targetEvent, shouldShowPreview])

  // Repost logic - fetch target event for reposts
  useEffect(() => {
    if (!isRepost) return

    const fetch = async () => {
      try {
        const eventFromContent = event.content ? (JSON.parse(event.content) as Event) : null
        if (eventFromContent && verifyEvent(eventFromContent)) {
          if (eventFromContent.kind === kinds.Repost) {
            return
          }
          client.addEventToCache(eventFromContent)
          const targetSeenOn = client.getSeenEventRelays(eventFromContent.id)
          if (targetSeenOn.length === 0) {
            const seenOn = client.getSeenEventRelays(event.id)
            seenOn.forEach((relay) => {
              client.trackEventSeenOn(eventFromContent.id, relay)
            })
          }
          setTargetEvent(eventFromContent)
          return
        }

        const [, id, relay, , pubkey] = event.tags.find(tagNameEquals('e')) ?? []
        if (!id) {
          return
        }
        const targetEventId = neventEncode({
          id,
          relays: relay ? [relay] : [],
          author: pubkey
        })
        const targetEvent = await client.fetchEvent(targetEventId)
        if (targetEvent) {
          setTargetEvent(targetEvent)
        }
      } catch {
        // ignore
      }
    }
    fetch()
  }, [event, isRepost])

  const shouldHide = useMemo(() => {
    if (!isRepost) return false
    if (!targetEvent) return true
    if (filterMutedNotes && mutePubkeySet.has(targetEvent.pubkey)) {
      return true
    }
    if (hideContentMentioningMutedUsers && isMentioningMutedUsers(targetEvent, mutePubkeySet)) {
      return true
    }
    return false
  }, [isRepost, targetEvent, filterMutedNotes, hideContentMentioningMutedUsers, mutePubkeySet])

  const showAllNotes = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAllNotesRead?.()
    push(toGroupedProfile(event.pubkey))
  }

  const showLastNote = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.()
    if (!areAllNotesRead) {
      onLastNoteRead?.()
    }
    push(toNote(event))
  }

  if (shouldHide) return null

  return (
    <div className={className}>
      <Collapsible alwaysExpand={false}>
        <div
          className={`clickable group/row transition-colors ${isSelected ? 'bg-muted/50' : ''}`}
          onClick={showLastNote}
        >
          {/* Top row */}
          <div className={`pt-3 ${shouldShowPreview ? 'pb-1' : 'pb-3'} cursor-pointer`}>
            <div className="px-4">
              <div className="flex justify-between items-center gap-2">
                <div
                  className={`flex items-center space-x-2 flex-1 ${!isSelected && isLastNoteRead && 'text-muted-foreground/70 grayscale'}`}
                >
                  <UserAvatar userId={event.pubkey} size="normal" />
                  <div className="flex-1 w-0">
                    <div className="flex gap-2 items-center">
                      <Username
                        userId={event.pubkey}
                        className="font-semibold flex truncate cursor-pointer hover:text-primary"
                        skeletonClassName="h-4"
                      />
                      <PinBuryBadge pubkey={event.pubkey} />
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <FormattedTimestamp timestamp={event.created_at} className="shrink-0" />
                      {relevanceScore !== undefined && (
                        <>
                          <span>·</span>
                          <span className="shrink-0 text-primary font-medium flex items-center gap-0.5">
                            <Sparkles size={14} />
                            {Math.round(relevanceScore)}
                          </span>
                        </>
                      )}
                      {isReply && (
                        <>
                          <span>·</span>
                          <span className="shrink-0">{t('Reply')}</span>
                        </>
                      )}
                      {isRepost && targetEvent && (
                        <>
                          <span>·</span>
                          <span className="shrink-0 hidden md:block">Reposting</span>
                          <Repeat2 size={16} className="shrink-0 block md:hidden" />
                          <UserAvatar userId={targetEvent.pubkey} size="xSmall" />
                          <SimpleUsername userId={targetEvent.pubkey} className="line-clamp-1" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Show compact mode menu and counter badge */}
                <div className="flex items-center gap-1">
                  <CompactModeMenu
                    pubkey={event.pubkey}
                    isLastNoteRead={isLastNoteRead}
                    areAllNotesRead={areAllNotesRead}
                    onMarkAsUnread={onMarkAsUnread}
                  />
                  <div
                    className={`w-8 h-8 ml-2 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer transition-all hover:border-primary/50 bg-primary/10 border border-primary/20
                      ${areAllNotesRead ? 'text-primary/50 grayscale' : 'text-primary'}`}
                    onClick={showAllNotes}
                  >
                    {totalNotesInTimeframe}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {shouldShowPreview && (
            <div
              className="px-4 pb-3 cursor-pointer"
              onClick={showLastNote}
              style={{ paddingLeft: '4rem' }}
            >
              {previewText === null ? (
                <Skeleton className="h-4 w-3/4" />
              ) : (
                <div
                  className={`text-muted-foreground transition-colors line-clamp-2 break-keep wrap-break-word ${!isSelected && isLastNoteRead && 'text-muted-foreground/50 grayscale'}`}
                >
                  {previewText}
                </div>
              )}
            </div>
          )}
        </div>
      </Collapsible>
      <Separator />
    </div>
  )
}

// Helper function to extract preview text from event
async function getPreviewText(event: Event): Promise<string> {
  if (event.kind === 20) {
    return '«image» ' + event.content.trim().substring(0, maxLength - 8)
  }

  let plainText = ''

  for (const block of parse(event.content)) {
    switch (block.type) {
      case 'text': {
        plainText += block.text
          .replace(/[*_~`#]/g, '') // Remove markdown characters
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .replace(/\s+/g, ' ') // Normalize whitespace
        break
      }
      case 'video': {
        plainText += '«video»'
        break
      }
      case 'audio': {
        plainText += '«audio»'
        break
      }
      case 'image': {
        plainText += '«image»'
        break
      }
      case 'reference': {
        if ('id' in block.pointer) {
          plainText += '«mention»'
        } else if ('identifier' in block.pointer) {
          plainText += '«mention»'
        } else {
          const profile = await client.fetchProfile(nprofileEncode(block.pointer))
          if (profile) {
            plainText += `@${username(profile)}`
          } else {
            plainText += `@${npubEncode(block.pointer.pubkey).slice(0, 12)}...`
          }
        }
        break
      }
      case 'relay': {
        plainText += block.url
        break
      }
      case 'url': {
        plainText += truncateUrl(block.url)
        break
      }
      case 'hashtag': {
        plainText += '#' + block.value
        break
      }
      case 'emoji': {
        plainText += ':' + block.shortcode + ':'
        break
      }
    }

    // Truncate if too long
    if (plainText.length > maxLength) {
      return plainText.trim().substring(0, maxLength).trim() + '...'
    }
  }

  return plainText.trim()
}
