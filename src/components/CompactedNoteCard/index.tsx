import { Separator } from '@/components/ui/separator'
import { Event } from 'nostr-tools'
import { useState } from 'react'
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

export default function CompactedNoteCard({
  event,
  className,
  totalNotesInTimeframe
}: {
  event: Event
  className?: string
  totalNotesInTimeframe: number
}) {
  const [expanded, setExpanded] = useState(false)

  const handleTopRowClick = (e: React.MouseEvent) => {
    // Allow clicks on interactive elements (links, buttons) to work normally
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest('a, button, [role="button"]') !== null

    if (!isInteractiveElement) {
      e.stopPropagation()
      setExpanded(!expanded)
    }
  }

  return (
    <div className={className}>
      <Collapsible alwaysExpand={false}>
        {/* Main clickable area - includes header and content when expanded */}
        <div
          className="clickable py-3"
          onClick={handleTopRowClick}
        >
          {/* Top row - always visible */}
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
                    <TranslateButton event={event} />
                    <NoteOptions event={event} className="py-1 shrink-0 [&_svg]:size-5" />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Expandable content - part of main hover area */}
          {expanded && (
            <>
              <Note
                className="px-4"
                size="normal"
                event={event}
                hideHeader={true}
              />
              <NoteStats className="mt-3 px-4" event={event} />
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