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

export default function CompactedNoteCard({
  event,
  className,
  totalNotesInTimeframe,
  isSelected = false,
  onSelect
}: {
  event: Event
  className?: string
  totalNotesInTimeframe: number
  isSelected?: boolean
  onSelect?: () => void
}) {
  const { push } = useSecondaryPage()

  const handleTopRowClick = (e: React.MouseEvent) => {
    // Allow clicks on interactive elements (links, buttons) to work normally
    const target = e.target as HTMLElement
    const isInteractiveElement = target.closest('a, button, [role="button"]') !== null

    if (!isInteractiveElement) {
      e.stopPropagation()
      onSelect?.() // Mark as selected
      push(toNote(event))
    }
  }

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    push(toNote(event))
  }

  const handleCounterClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    push(toProfile(event.pubkey))
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
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center space-x-2 flex-1">
                <UserAvatar userId={event.pubkey} size="normal" />
                <div className="flex-1 w-0">
                  <div className="flex gap-2 items-center">
                    <Username
                      userId={event.pubkey}
                      className="font-semibold flex truncate cursor-pointer hover:text-primary"
                      skeletonClassName="h-4"
                      onClick={handleAuthorClick}
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
                <div
                  className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-medium text-primary cursor-pointer hover:bg-primary/20"
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