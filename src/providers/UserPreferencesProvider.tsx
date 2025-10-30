import storage from '@/services/local-storage.service'
import { LINK_PREVIEW_MODE } from '@/constants'
import { TLinkPreviewMode, TNotificationStyle } from '@/types'
import { createContext, useContext, useEffect, useState } from 'react'
import { useScreenSize } from './ScreenSizeProvider'

type TUserPreferencesContext = {
  notificationListStyle: TNotificationStyle
  updateNotificationListStyle: (style: TNotificationStyle) => void

  muteMedia: boolean
  updateMuteMedia: (mute: boolean) => void

  sidebarCollapse: boolean
  updateSidebarCollapse: (collapse: boolean) => void

  enableSingleColumnLayout: boolean
  updateEnableSingleColumnLayout: (enable: boolean) => void

  linkPreviewMode: TLinkPreviewMode
  updateLinkPreviewMode: (mode: TLinkPreviewMode) => void
}

const UserPreferencesContext = createContext<TUserPreferencesContext | undefined>(undefined)

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { isSmallScreen } = useScreenSize()
  const [notificationListStyle, setNotificationListStyle] = useState(
    storage.getNotificationListStyle()
  )
  const [muteMedia, setMuteMedia] = useState(true)
  const [sidebarCollapse, setSidebarCollapse] = useState(storage.getSidebarCollapse())
  const [enableSingleColumnLayout, setEnableSingleColumnLayout] = useState(
    storage.getEnableSingleColumnLayout()
  )
  const [linkPreviewMode, setLinkPreviewMode] = useState(storage.getLinkPreviewMode())

  useEffect(() => {
    if (!isSmallScreen && enableSingleColumnLayout) {
      document.documentElement.style.setProperty('overflow-y', 'scroll')
    } else {
      document.documentElement.style.removeProperty('overflow-y')
    }
  }, [enableSingleColumnLayout, isSmallScreen])

  const updateNotificationListStyle = (style: TNotificationStyle) => {
    setNotificationListStyle(style)
    storage.setNotificationListStyle(style)
  }

  const updateSidebarCollapse = (collapse: boolean) => {
    setSidebarCollapse(collapse)
    storage.setSidebarCollapse(collapse)
  }

  const updateEnableSingleColumnLayout = (enable: boolean) => {
    setEnableSingleColumnLayout(enable)
    storage.setEnableSingleColumnLayout(enable)
  }

  const updateLinkPreviewMode = (mode: TLinkPreviewMode) => {
    setLinkPreviewMode(mode)
    storage.setLinkPreviewMode(mode)
  }

  // On mobile, fallback 'on-mouseover' to 'enabled' since hover doesn't make sense on touch
  const effectiveLinkPreviewMode =
    isSmallScreen && linkPreviewMode === LINK_PREVIEW_MODE.ON_MOUSEOVER
      ? LINK_PREVIEW_MODE.ENABLED
      : linkPreviewMode

  return (
    <UserPreferencesContext.Provider
      value={{
        notificationListStyle,
        updateNotificationListStyle,
        muteMedia,
        updateMuteMedia: setMuteMedia,
        sidebarCollapse,
        updateSidebarCollapse,
        enableSingleColumnLayout: isSmallScreen ? true : enableSingleColumnLayout,
        updateEnableSingleColumnLayout,
        linkPreviewMode: effectiveLinkPreviewMode,
        updateLinkPreviewMode
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}
