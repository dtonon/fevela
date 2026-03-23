import { usePendingCountdown, usePendingPublishMap } from '@/lib/pendingPublish'
import { Event } from '@nostr/tools/wasm'

function CountdownButton({
  endAt,
  onUndo,
  className
}: {
  endAt: number
  onUndo: () => void
  className?: string
}) {
  const secondsLeft = usePendingCountdown(endAt)
  if (secondsLeft === 0) return null
  return (
    <button
      className={`w-full rounded-md border border-input text-primary bg-background px-3 py-2 font-medium shadow-sm hover:bg-accent hover:text-primary transition-colors text-center ${className ?? ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onUndo()
      }}
      aria-label={`Undo post, ${secondsLeft} seconds remaining`}
    >
      Changed your mind? Undo in {secondsLeft}s
    </button>
  )
}

export default function PendingUndoButton({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const pendingMap = usePendingPublishMap()
  const pending = pendingMap.get(event.id)
  if (!pending) return null
  return <CountdownButton endAt={pending.endAt} onUndo={pending.onUndo} className={className} />
}
