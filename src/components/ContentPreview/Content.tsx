import { parse } from '@nostr/tools/nip27'
import { nprofileEncode } from '@nostr/tools/nip19'
import { cn } from '@/lib/utils'
import { ReactElement, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EmbeddedHashtag, EmbeddedWebsocketUrl } from '../Embedded'
import Emoji from '../Emoji'
import { NostrEvent } from '@nostr/tools/core'
import { SimpleUsername } from '../Username'

export default function Content({ event, className }: { event: NostrEvent; className?: string }) {
  const { t } = useTranslation()

  const nodes = useMemo(() => {
    const nodes: ReactElement[] = []

    for (const block of parse(event)) {
      switch (block.type) {
        case 'text': {
          nodes.push(<span key={nodes.length}>{block.text}</span>)
          break
        }
        case 'url': {
          nodes.push(<span key={nodes.length}>{block.url}</span>)
          break
        }
        case 'audio':
        case 'video': {
          nodes.push(<span key={nodes.length}>{`[${t('Media')}]`}</span>)
          break
        }
        case 'image': {
          nodes.push(<span key={nodes.length}>{`[${t('Image')}]`}</span>)
          break
        }
        case 'relay': {
          nodes.push(<EmbeddedWebsocketUrl key={nodes.length} url={block.url} />)
          break
        }
        case 'reference': {
          if ('id' in block.pointer) {
            nodes.push(<span key={nodes.length}>{`[${t('Note')}]`}</span>)
          } else if ('identifier' in block.pointer) {
            nodes.push(<span key={nodes.length}>{`[${t('Note')}]`}</span>)
          } else {
            nodes.push(
              <SimpleUsername
                key={nodes.length}
                userId={nprofileEncode(block.pointer)}
                showAt
                className={cn('inline', className)}
                withoutSkeleton
              />
            )
          }
          break
        }
        case 'hashtag': {
          nodes.push(<EmbeddedHashtag key={nodes.length} hashtag={block.value} />)
          break
        }
        case 'emoji': {
          nodes.push(<Emoji key={nodes.length} classNames={{ img: 'mb-1' }} emoji={block} />)
          break
        }
      }
    }

    return nodes
  }, [event])

  return <span className={cn('pointer-events-none', className)}>{nodes}</span>
}
