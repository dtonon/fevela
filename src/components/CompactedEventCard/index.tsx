import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { isMentioningMutedUsers, isReplyNoteEvent } from '@/lib/event'
import { tagNameEquals } from '@/lib/tag'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useGroupedNotes } from '@/providers/GroupedNotesProvider'
import client from '@/services/client.service'
import { Event, kinds, nip19, verifyEvent } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Collapsible from '../Collapsible'
import { FormattedTimestamp } from '../FormattedTimestamp'
import UserAvatar from '../UserAvatar'
import Username, { SimpleUsername } from '../Username'
import { useSecondaryPage } from '@/PageManager'
import { toNote, toProfile } from '@/lib/link'
import { userIdToPubkey } from '@/lib/pubkey'
import PinBuryBadge from '../PinBuryBadge'
import CompactModeMenu from '../CompactModeMenu'
import { username } from '@/lib/event-metadata'

// Helper function to extract preview text from event
async function getPreviewText(event: Event): Promise<string> {
  const content = event.content.trim()

  // Check for media-only notes
  const hasImage = content.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i)
  const hasVideo = content.match(/https?:\/\/\S+\.(mp4|webm|mov)/i)
  const hasAudio = content.match(/https?:\/\/\S+\.(mp3|wav|ogg)/i)

  // Handle nostr: entities
  let processedContent = content
    // Replace non-profile nostr entities with << mention >>
    .replace(/nostr:(note|nevent|naddr|nrelay)[a-zA-Z0-9]+/g, '<< mention >>')

  // Find and replace npub/nprofile with usernames
  const profileMatches = processedContent.match(/nostr:(npub|nprofile)[a-zA-Z0-9]+/g)
  if (profileMatches) {
    for (const match of profileMatches) {
      try {
        const userId = match.replace('nostr:', '')
        const pubkey = userIdToPubkey(userId)
        if (pubkey) {
          const profile = await client.fetchProfile(userId)
          if (profile) {
            processedContent = processedContent.replace(match, `@${username(profile)}`)
          } else {
            // If profile not found, show shortened version
            processedContent = processedContent.replace(match, `@${userId.substring(0, 12)}...`)
          }
        }
      } catch {
        // If parsing fails, keep the original
      }
    }
  }

  // Extract text without regular URLs
  const textWithoutUrls = processedContent.replace(/https?:\/\/\S+/g, '').trim()

  if (!textWithoutUrls) {
    if (hasImage) return '<< image >>'
    if (hasVideo) return '<< video >>'
    if (hasAudio) return '<< audio >>'
  }

  // Strip markdown and formatting
  const plainText = textWithoutUrls
    .replace(/[*_~`#]/g, '') // Remove markdown characters
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // Truncate if too long
  const maxLength = 150
  if (plainText.length > maxLength) {
    return plainText.substring(0, maxLength).trim() + '...'
  }

  return plainText
}

export default function CompactedEventCard({
  event,
  className,
  totalNotesInTimeframe,
  oldestTimestamp,
  variant = 'note',
  filterMutedNotes = true,
  isSelected = false,
  onSelect,
  onLastNoteRead,
  onAllNotesRead,
  isLastNoteRead = false,
  areAllNotesRead = false
}: {
  event: Event
  className?: string
  totalNotesInTimeframe: number
  oldestTimestamp?: number
  variant?: 'note' | 'repost'
  filterMutedNotes?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onLastNoteRead?: () => void
  onAllNotesRead?: () => void
  isLastNoteRead?: boolean
  areAllNotesRead?: boolean
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
      const eventToPreview = isRepost && targetEvent ? targetEvent : event
      const preview = await getPreviewText(eventToPreview)
      setPreviewText(preview)
    }
    generatePreview()
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
        const targetEventId = nip19.neventEncode({
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
    push(
      toProfile(event.pubkey, { hideTopSection: true, since: oldestTimestamp, fromGrouped: true })
    )
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
                <div className="flex items-center space-x-2 flex-1">
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
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <FormattedTimestamp timestamp={event.created_at} className="shrink-0" />
                      {isReply && (
                        <>
                          <span>·</span>
                          <span className="shrink-0">{t('Reply')}</span>
                        </>
                      )}
                      {isRepost && targetEvent && (
                        <>
                          <span>·</span>
                          <span className="shrink-0">Reposting</span>
                          <UserAvatar userId={targetEvent.pubkey} size="xSmall" />
                          <SimpleUsername userId={targetEvent.pubkey} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {/* Show compact mode menu and counter badge */}
                <div className="flex items-center gap-1">
                  <CompactModeMenu pubkey={event.pubkey} />
                  <div
                    className={`w-8 h-8 ml-2 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer transition-all ${
                      isLastNoteRead
                        ? 'bg-primary/10 border border-primary/20 grayscale group-hover/row:border-foreground/30'
                        : 'bg-primary/10 border border-primary/20 group-hover/row:border-foreground/30'
                    } ${areAllNotesRead ? 'text-primary/50 grayscale' : 'text-primary'}`}
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
                <div className="text-muted-foreground transition-colors line-clamp-2 leading-5">
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
