import HideUntrustedContentButton from '@/components/HideUntrustedContentButton'
import ConversationList from '@/components/ConversationList'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { usePrimaryPage } from '@/PageManager'
import { MessageSquare } from 'lucide-react'
import { forwardRef, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

const ConversationListPage = forwardRef((_, ref) => {
  const { current } = usePrimaryPage()
  const firstRenderRef = useRef(true)
  const conversationListRef = useRef<{ refresh: () => void }>(null)

  useEffect(() => {
    if (current === 'conversations' && !firstRenderRef.current) {
      conversationListRef.current?.refresh()
    }
    firstRenderRef.current = false
  }, [current])

  return (
    <PrimaryPageLayout
      ref={ref}
      pageName="conversations"
      titlebar={<ConversationListPageTitlebar />}
      displayScrollToTopButton
    >
      <ConversationList ref={conversationListRef} />
    </PrimaryPageLayout>
  )
})
ConversationListPage.displayName = 'ConversationListPage'
export default ConversationListPage

function ConversationListPageTitlebar() {
  const { t } = useTranslation()

  return (
    <div className="flex gap-2 items-center justify-between h-full pl-3">
      <div className="flex items-center gap-2">
        <MessageSquare />
        <div className="text-lg font-semibold">{t('Conversations')}</div>
      </div>
      <HideUntrustedContentButton type="notifications" size="titlebar-icon" />
    </div>
  )
}
