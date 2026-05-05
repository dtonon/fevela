import PendingList, { TPendingListRef } from '@/components/PendingList'
import { Button } from '@/components/ui/button'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { usePending } from '@/providers/PendingProvider'
import { CloudUpload } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const PendingPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const listRef = useRef<TPendingListRef>(null)
  const layoutRef = useRef<any>(null)
  const [hasItems, setHasItems] = useState(false)
  const [isPublishingAll, setIsPublishingAll] = useState(false)
  const { pendingIds } = usePending()

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: (behavior: ScrollBehavior = 'smooth') => layoutRef.current?.scrollToTop(behavior)
    }),
    []
  )

  useEffect(() => {
    if (listRef.current) {
      setHasItems(listRef.current.hasItems)
      setIsPublishingAll(listRef.current.isPublishingAll)
    }
  }, [pendingIds, listRef.current?.isPublishingAll, listRef.current?.hasItems])

  return (
    <PrimaryPageLayout
      pageName="pending"
      ref={layoutRef}
      titlebar={
        <div className="flex justify-between items-center w-full px-3">
          <div className="flex gap-2 items-center">
            <CloudUpload />
            <div className="text-lg font-semibold">{t('Pending')}</div>
          </div>
          {hasItems && (
            <Button
              size="sm"
              onClick={() => listRef.current?.publishAll()}
              disabled={isPublishingAll}
            >
              {isPublishingAll ? t('Publishing...') : t('Publish all')}
            </Button>
          )}
        </div>
      }
      displayScrollToTopButton
    >
      <PendingList ref={listRef} />
    </PrimaryPageLayout>
  )
})

PendingPage.displayName = 'PendingPage'
export default PendingPage
