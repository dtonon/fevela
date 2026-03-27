import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Event } from '@nostr/tools/wasm'
import { List, Radio } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import HideUntrustedContentButton from '../HideUntrustedContentButton'
import QuoteList from '../QuoteList'
import ReactionList from '../ReactionList'
import ReplyNoteList from '../ReplyNoteList'
import RepostList from '../RepostList'
import ZapList from '../ZapList'
import { Tabs, TTabValue } from './Tabs'
import PostRelaySelector from '../PostEditor/PostRelaySelector'
import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu'
import { simplifyUrl } from '@/lib/url'

export default function NoteInteractions({
  pageIndex,
  event
}: {
  pageIndex?: number
  event: Event
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<TTabValue>('replies')
  const [showOnlyFirstLevel, setShowOnlyFirstLevel] = useState(false)
  const [selectedRelayUrls, setSelectedRelayUrls] = useState<string[]>([])
  let list
  switch (type) {
    case 'replies':
      list = (
        <ReplyNoteList
          index={pageIndex}
          event={event}
          showOnlyFirstLevel={showOnlyFirstLevel}
          selectedRelayUrls={selectedRelayUrls}
        />
      )
      break
    case 'quotes':
      list = <QuoteList event={event} />
      break
    case 'reactions':
      list = <ReactionList event={event} />
      break
    case 'reposts':
      list = <RepostList event={event} />
      break
    case 'zaps':
      list = <ZapList event={event} />
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
          <PostRelaySelector setAdditionalRelayUrls={setSelectedRelayUrls} parentEvent={event}>
            <div className="size-10 flex items-center justify-center">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title={
                    selectedRelayUrls.length
                      ? `${t('Relays')}: ${selectedRelayUrls.map(simplifyUrl).join(', ')}`
                      : t('Relays')
                  }
                >
                  <Radio
                    className={selectedRelayUrls.length ? 'text-primary' : 'text-muted-foreground'}
                  />
                </Button>
              </DropdownMenuTrigger>
            </div>
          </PostRelaySelector>
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
