import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Event } from '@nostr/tools/wasm'
import { List } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import HideUntrustedContentButton from '../HideUntrustedContentButton'
import QuoteList from '../QuoteList'
import ReactionList from '../ReactionList'
import ReplyNoteList from '../ReplyNoteList'
import RepostList from '../RepostList'
import ZapList from '../ZapList'
import { Tabs, TTabValue } from './Tabs'

export default function NoteInteractions({
  pageIndex,
  stuff
}: {
  pageIndex?: number
  stuff: Event
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<TTabValue>('replies')
  const [showOnlyFirstLevel, setShowOnlyFirstLevel] = useState(false)
  let list
  switch (type) {
    case 'replies':
      list = (
        <ReplyNoteList index={pageIndex} stuff={stuff} showOnlyFirstLevel={showOnlyFirstLevel} />
      )
      break
    case 'quotes':
      list = <QuoteList event={stuff} />
      break
    case 'reactions':
      list = <ReactionList stuff={stuff} />
      break
    case 'reposts':
      list = <RepostList event={stuff} />
      break
    case 'zaps':
      list = <ZapList event={stuff} />
      break
    default:
      break
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <ScrollArea className="flex-1 w-0">
          <Tabs selectedTab={type} onTabChange={setType} />
          <ScrollBar orientation="horizontal" className="opacity-0 pointer-events-none" />
        </ScrollArea>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center">
          {type === 'replies' && (
            <div className="size-10 flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowOnlyFirstLevel(!showOnlyFirstLevel)}
                title={t('ShowOnlyFirstLevelReplies')}
              >
                <List className={showOnlyFirstLevel ? 'text-primary' : 'text-muted-foreground'} />
              </Button>
            </div>
          )}
          <div className="size-10 flex items-center justify-center">
            <HideUntrustedContentButton type="interactions" />
          </div>
        </div>
      </div>
      <Separator />
      {list}
    </>
  )
}
