import PendingList, { TPendingListRef } from '@/components/PendingList'
import { Button } from '@/components/ui/button'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePending } from '@/providers/PendingProvider'

const PendingsPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const listRef = useRef<TPendingListRef>(null)
  const [hasItems, setHasItems] = useState(false)
  const [isPublishingAll, setIsPublishingAll] = useState(false)
  const { pendingIds } = usePending()

  useEffect(() => {
    if (listRef.current) {
      setHasItems(listRef.current.hasItems)
      setIsPublishingAll(listRef.current.isPublishingAll)
    }
  }, [pendingIds, listRef.current?.isPublishingAll, listRef.current?.hasItems])

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={t('Pending')}
      controls={
        hasItems ? (
          <Button
            size="sm"
            onClick={() => listRef.current?.publishAll()}
            disabled={isPublishingAll}
          >
            {isPublishingAll ? t('Publishing...') : t('Publish all')}
          </Button>
        ) : undefined
      }
      displayScrollToTopButton
    >
      <PendingList ref={listRef} />
    </SecondaryPageLayout>
  )
})

PendingsPage.displayName = 'PendingsPage'
export default PendingsPage
