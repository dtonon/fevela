import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePrimaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { SimpleUserAvatar } from '../UserAvatar'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function AccountButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { pubkey, profile } = useNostr()
  const active = useMemo(() => current === 'me' && display, [display, current])

  return (
    <BottomNavigationBarItem
      onClick={() => {
        navigate('me')
      }}
      active={active}
    >
      {pubkey ? (
        profile ? (
          <SimpleUserAvatar
            userId={pubkey}
            className={cn('w-7 h-7', active ? 'ring-primary ring-1' : '')}
          />
        ) : (
          <Skeleton className={cn('w-7 h-7 rounded-full', active ? 'ring-primary ring-1' : '')} />
        )
      ) : (
        <UserRound />
      )}
    </BottomNavigationBarItem>
  )
}
