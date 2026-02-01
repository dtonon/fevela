import Icon from '@/assets/Icon'
import Logo from '@/assets/Logo'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import AccountButton from './AccountButton'
import RelaysButton from './ExploreButton'
import FollowingButton from './FollowingButton'
import RelayFeedButton from './RelayFeedButton'
import ConversationsButton from './ConversationsButton'
import NotificationsButton from './NotificationButton'
import PostButton from './PostButton'
import ProfileButton from './ProfileButton'
import SearchButton from './SearchButton'
import SettingsButton from './SettingsButton'

export default function PrimaryPageSidebar() {
  const { isSmallScreen } = useScreenSize()
  const { sidebarCollapse, updateSidebarCollapse, enableSingleColumnLayout } = useUserPreferences()

  if (isSmallScreen) return null

  return (
    <div
      className={cn(
        'relative flex flex-col pb-2 pt-3 justify-between h-full shrink-0',
        sidebarCollapse ? 'px-2 w-16' : 'pl-3 pr-2 w-52'
      )}
    >
      <div className="space-y-2">
        {sidebarCollapse ? (
          <div className="px-3 py-1 ml-1 mb-6 w-full">
            <Icon />
          </div>
        ) : (
          <div className="ml-3 pr-8 mt-2 mb-6 w-full">
            <Logo />
          </div>
        )}
        <FollowingButton collapse={sidebarCollapse} />
        <RelayFeedButton collapse={sidebarCollapse} />
        <ConversationsButton collapse={sidebarCollapse} />
        <NotificationsButton collapse={sidebarCollapse} />
        <SearchButton collapse={sidebarCollapse} />
        <RelaysButton collapse={sidebarCollapse} />
        <ProfileButton collapse={sidebarCollapse} />
        <SettingsButton collapse={sidebarCollapse} />
        <PostButton collapse={sidebarCollapse} />
      </div>
      <div className="space-y-4">
        <div className="block">
          <button
            className={cn(
              'absolute right-0 bottom-14 flex flex-col justify-center items-center w-5 h-6 p-0 rounded-l-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors [&_svg]:size-4',
              enableSingleColumnLayout ? '' : 'hover:shadow-md'
            )}
            onClick={(e) => {
              e.stopPropagation()
              updateSidebarCollapse(!sidebarCollapse)
            }}
          >
            {sidebarCollapse ? <ChevronsRight /> : <ChevronsLeft />}
          </button>
        </div>
        <AccountButton collapse={sidebarCollapse} />
      </div>
    </div>
  )
}
