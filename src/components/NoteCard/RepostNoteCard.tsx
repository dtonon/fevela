import { isMentioningMutedUsers } from '@/lib/event'
import { tagNameEquals } from '@/lib/tag'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import client from '@/services/client.service'
import { Event, verifyEvent } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { neventEncode } from '@nostr/tools/nip19'
import { useEffect, useMemo, useState } from 'react'
import Collapsible from '../Collapsible'
import Note from '../Note'
import NoteStats from '../NoteStats'
import PinnedButton from './PinnedButton'
import RepostDescription from './RepostDescription'
import { useSecondaryPage } from '@/PageManager'
import { toNote } from '@/lib/link'

export default function RepostNoteCard({
  event,
  className,
  filterMutedNotes = true,
  pinned = false,
  onTargetEventLoaded
}: {
  event: Event
  className?: string
  filterMutedNotes?: boolean
  pinned?: boolean
  onTargetEventLoaded?: (event: Event) => void
}) {
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const [targetEvent, setTargetEvent] = useState<Event | null>(null)
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
          onTargetEventLoaded?.(eventFromContent)
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
          onTargetEventLoaded?.(targetEvent)
        }
      } catch {
        // ignore
      }
    }
    fetch()
  }, [event])

  const { push } = useSecondaryPage()

  if (!targetEvent || shouldHide) return null

  return (
    <div
      className={className}
      onClick={(e) => {
        e.stopPropagation()
        push(toNote(targetEvent.id ?? event))
      }}
    >
      <div className="clickable py-3">
        <Collapsible alwaysExpand={false}>
          {pinned && <PinnedButton event={targetEvent} />}
          <RepostDescription className="px-4" reposter={event.pubkey} />
          <Note className="px-4" size="normal" event={targetEvent} originalNoteId={event.id} />
        </Collapsible>
        <NoteStats className="mt-3 px-4 pb-4" event={targetEvent} fetchIfNotExisting />
      </div>
    </div>
  )
}
