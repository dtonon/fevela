import { Separator } from '@/components/ui/separator'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSecondaryPage } from '@/PageManager'
import { Event } from 'nostr-tools'
import Collapsible from '../Collapsible'
import GroupedNotesIndicator from '../GroupedNotesIndicator'
import Note from '../Note'
import NoteStats from '../NoteStats'
import PinnedButton from './PinnedButton'
import RepostDescription from './RepostDescription'

export default function MainNoteCard({
  event,
  className,
  reposter,
  embedded,
  originalNoteId,
  groupedNotesTotalCount,
  groupedNotesOldestTimestamp,
  onAllNotesRead,
  areAllNotesRead,
  pinned = false
}: {
  event: Event
  className?: string
  reposter?: string
  embedded?: boolean
  originalNoteId?: string
  groupedNotesTotalCount?: number
  groupedNotesOldestTimestamp?: number
  onAllNotesRead?: () => void
  areAllNotesRead?: boolean
  pinned?: boolean
}) {
  const { push } = useSecondaryPage()

  return (
    <div
      className={className}
      onClick={(e) => {
        e.stopPropagation()
        push(toNote(originalNoteId ?? event))
      }}
    >
      <div className={cn('clickable', embedded ? 'p-2 sm:p-3 border rounded-lg' : 'py-3')}>
        <Collapsible alwaysExpand={embedded}>
          {pinned && <PinnedButton event={event} />}
          <RepostDescription className={embedded ? '' : 'px-4'} reposter={reposter} />
          <Note
            className={embedded ? '' : 'px-4'}
            size={embedded ? 'small' : 'normal'}
            event={event}
            originalNoteId={originalNoteId}
          />
        </Collapsible>
        {!embedded && <NoteStats className="mt-3 px-4 pb-4" event={event} />}
        {!embedded && groupedNotesTotalCount && (
          <GroupedNotesIndicator
            event={event}
            totalNotesInTimeframe={groupedNotesTotalCount}
            oldestTimestamp={groupedNotesOldestTimestamp}
            onAllNotesRead={onAllNotesRead}
            areAllNotesRead={areAllNotesRead}
          />
        )}
      </div>
      {!embedded && <Separator />}
    </div>
  )
}
