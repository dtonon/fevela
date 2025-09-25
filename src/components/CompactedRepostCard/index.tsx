import { Separator } from '@/components/ui/separator'
import { isMentioningMutedUsers } from '@/lib/event'
import { tagNameEquals } from '@/lib/tag'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import client from '@/services/client.service'
import { Event, kinds, nip19, verifyEvent } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import Collapsible from '../Collapsible'
import ClientTag from '../ClientTag'
import { FormattedTimestamp } from '../FormattedTimestamp'
import GroupedNotesIndicator from '../GroupedNotesIndicator'
import Nip05 from '../Nip05'
import Note from '../Note'
import NoteOptions from '../NoteOptions'
import NoteStats from '../NoteStats'
import TranslateButton from '../TranslateButton'
import UserAvatar from '../UserAvatar'
import Username from '../Username'

export default function CompactedRepostCard({
  event,
  className,
  totalNotesInTimeframe,
  filterMutedNotes = true
}: {
  event: Event
  className?: string
  totalNotesInTimeframe: number
  filterMutedNotes?: boolean
}) {
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const [targetEvent, setTargetEvent] = useState<Event | null>(null)
  const [expanded, setExpanded] = useState(false)

  const shouldHide = useMemo(() => {
    if (!targetEvent) return true
    if (filterMutedNotes && mutePubkeySet.has(targetEvent.pubkey)) {
      return true
    }
    if (hideContentMentioningMutedUsers && isMentioningMutedUsers(targetEvent, mutePubkeySet)) {
      return true
    }
    return false
  }, [targetEvent, filterMutedNotes, hideContentMentioningMutedUsers, mutePubkeySet])

  // Repost logic from RepostNoteCard
  useEffect(() => {
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
  }, [event])

  const handleTopRowClick = (e: React.MouseEvent) => {
    // Allow clicks on interactive elements (links, buttons) to work normally
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest('a, button, [role="button"]') !== null

    if (!isInteractiveElement) {
      e.stopPropagation()
      setExpanded(!expanded)
    }
  }

  if (!targetEvent || shouldHide) return null

  return (
    <div className={className}>
      <Collapsible alwaysExpand={false}>
        {/* Main clickable area - includes header and content when expanded */}
        <div
          className="clickable py-3"
          onClick={handleTopRowClick}
        >
          {/* Top row - always visible - shows reposter info */}
          <div className="px-4">
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center space-x-2 flex-1">
                <UserAvatar userId={event.pubkey} size="normal" />
                <div className="flex-1 w-0">
                  <div className="flex gap-2 items-center">
                    <Username
                      userId={event.pubkey}
                      className="font-semibold flex truncate"
                      skeletonClassName="h-4"
                    />
                    <ClientTag event={event} />
                    <span className="text-sm text-muted-foreground">reposted</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Nip05 pubkey={event.pubkey} append="·" />
                    <FormattedTimestamp
                      timestamp={event.created_at}
                      className="shrink-0"
                    />
                  </div>
                </div>
              </div>
              {/* Show counter badge when collapsed, NoteOptions when expanded */}
              <div className="flex items-center">
                {!expanded ? (
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                    {totalNotesInTimeframe}
                  </div>
                ) : (
                  <>
                    <TranslateButton event={targetEvent} />
                    <NoteOptions event={targetEvent} className="py-1 shrink-0 [&_svg]:size-5" />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Expandable content - shows original note with full header */}
          {expanded && (
            <>
              <Note
                className="px-4 mt-2"
                size="normal"
                event={targetEvent}
                hideHeader={false}
              />
              <NoteStats className="mt-3 px-4" event={targetEvent} />
            </>
          )}
        </div>

        {/* Separate hover area for grouped notes indicator */}
        {expanded && (
          <GroupedNotesIndicator
            event={event}
            totalNotesInTimeframe={totalNotesInTimeframe}
          />
        )}
      </Collapsible>
      <Separator />
    </div>
  )
}