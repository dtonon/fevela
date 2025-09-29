import { Separator } from '@/components/ui/separator'
import { Event } from 'nostr-tools'
import Collapsible from '../Collapsible'
import ClientTag from '../ClientTag'
import { FormattedTimestamp } from '../FormattedTimestamp'
import Nip05 from '../Nip05'
import UserAvatar from '../UserAvatar'
import Username from '../Username'
import { useSecondaryPage } from '@/PageManager'
import { toNote, toProfile } from '@/lib/link'
import { isReplyNoteEvent } from '@/lib/event'
import { useTranslation } from 'react-i18next'

export default function CompactedNoteCard({
  event,
  className,
  totalNotesInTimeframe,
  oldestTimestamp,
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
  isSelected?: boolean
  onSelect?: () => void
  onLastNoteRead?: () => void
  onAllNotesRead?: () => void
  isLastNoteRead?: boolean
  areAllNotesRead?: boolean
}) {
  const { push } = useSecondaryPage()
  const { t } = useTranslation()
  const isReply = isReplyNoteEvent(event)

  const handleTopRowClick = (e: React.MouseEvent) => {
    // Allow clicks on interactive elements (links, buttons) to work normally
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest('a, button, [role="button"]') !== null

    if (!isInteractiveElement) {
      e.stopPropagation()
      onSelect?.()
      // Only mark as read if not already fully read
      if (!areAllNotesRead) {
        onLastNoteRead?.()
      }
      push(toNote(event))
    }
  }

  const handleCounterClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAllNotesRead?.()
    push(
      toProfile(event.pubkey, { hideTopSection: true, since: oldestTimestamp, fromGrouped: true })
    )
  }

  return (
    <div className={className}>
      <Collapsible alwaysExpand={false}>
        {/* Main clickable area - includes header and content when expanded */}
        <div
          className={`clickable py-3 ${isSelected ? 'bg-muted/50' : ''}`}
          onClick={handleTopRowClick}
        >
          {/* Top row - always visible */}
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
                    <ClientTag event={event} />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Nip05 pubkey={event.pubkey} append="·" />
                    <FormattedTimestamp timestamp={event.created_at} className="shrink-0" />
                    {isReply && (
                      <>
                        <span>·</span>
                        <span className="shrink-0">{t('Reply')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {/* Show counter badge when collapsed, NoteOptions when expanded */}
              <div className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium cursor-pointer transition-all ${
                    isLastNoteRead
                      ? 'bg-primary/10 border border-primary/20 grayscale hover:bg-primary/20'
                      : 'bg-primary/10 border border-primary/20 hover:bg-primary/20'
                  } ${areAllNotesRead ? 'text-primary/50 grayscale' : 'text-primary'}`}
                  onClick={handleCounterClick}
                >
                  {totalNotesInTimeframe}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Collapsible>
      <Separator />
    </div>
  )
}
