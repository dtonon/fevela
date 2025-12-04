import { cn } from '@/lib/utils'
import Username from '../Username'

export function EmbeddedMention({ userId, className }: { userId: string; className?: string }) {
  return (
    <Username
      userId={userId}
      showAt
      className={cn('text-primary font-normal inline', className)}
      withoutSkeleton
    />
  )
}
