import { useTranslatedEvent } from '@/hooks'
import { LINK_PREVIEW_MODE } from '@/constants'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { getImetaInfoFromImetaTag } from '@/lib/tag'
import { cn } from '@/lib/utils'
import mediaUpload from '@/services/media-upload.service'
import { TImetaInfo } from '@/types'
import { Event } from '@nostr/tools/wasm'
import { parse } from '@nostr/tools/nip27'
import { neventEncode, naddrEncode, nprofileEncode } from '@nostr/tools/nip19'
import { ReactElement, useMemo } from 'react'
import { EmbeddedHashtag, EmbeddedMention, EmbeddedNote, EmbeddedWebsocketUrl } from '../Embedded'
import Emoji from '../Emoji'
import ExternalLink from '../ExternalLink'
import ImageGallery from '../ImageGallery'
import MediaPlayer from '../MediaPlayer'
import WebPreview from '../WebPreview'
import YoutubeEmbeddedPlayer from '../YoutubeEmbeddedPlayer'

export default function Content({
  event,
  content,
  className,
  mustLoadMedia
}: {
  event?: Event
  content?: string
  className?: string
  mustLoadMedia?: boolean
}) {
  const { linkPreviewMode } = useUserPreferences()
  const translatedEvent = useTranslatedEvent(event?.id)
  const nodes = useMemo(() => {
    const nodes: ReactElement[] = []
    const allImages: TImetaInfo[] = []
    let imageIndex = 0

    for (const block of parse(translatedEvent ?? event ?? content ?? '')) {
      switch (block.type) {
        case 'text': {
          if (block.text.trim() === '') continue

          nodes.push(<span>{block.text}</span>)
          break
        }
        case 'url': {
          if (
            block.url.startsWith('https://www.youtube.com/watch') ||
            block.url.startsWith('https://youtu.be/')
          ) {
            nodes.push(
              <YoutubeEmbeddedPlayer url={block.url} className="mt-2" mustLoad={mustLoadMedia} />
            )
          } else if (linkPreviewMode === LINK_PREVIEW_MODE.ENABLED) {
            nodes.push(<WebPreview className="mt-2" url={block.url} />)
          } else {
            nodes.push(<ExternalLink url={block.url} />)
          }
          break
        }
        case 'relay': {
          nodes.push(<EmbeddedWebsocketUrl url={block.url} />)
          break
        }
        case 'image': {
          if (nodes.length > 0 && (nodes[nodes.length - 1].type as any).name === 'ImageGallery') {
            nodes[nodes.length - 1] = (
              <ImageGallery
                className="mt-2"
                images={allImages}
                start={(nodes[nodes.length - 1].props as any).start}
                end={imageIndex + 1}
                mustLoad={mustLoadMedia}
              />
            )
          } else {
            nodes.push(
              <ImageGallery
                className="mt-2"
                images={allImages}
                start={imageIndex}
                end={imageIndex + 1}
                mustLoad={mustLoadMedia}
              />
            )
          }

          let imeta: TImetaInfo | null = null
          if (event) {
            let tag = event.tags.find(
              ([k, ...vals]) => k === 'imeta' && vals.find((val) => val === `url ${block.url}`)
            )
            if (!tag) tag = mediaUpload.getImetaTagByUrl(block.url)
            if (tag) {
              imeta = getImetaInfoFromImetaTag(tag, event.pubkey)
            }
          }
          if (!imeta) imeta = { url: block.url, pubkey: event?.pubkey }

          allImages.push(imeta)
          imageIndex++
          break
        }
        case 'video': {
          nodes.push(<MediaPlayer className="mt-2" src={block.url} mustLoad={mustLoadMedia} />)
          break
        }
        case 'audio': {
          nodes.push(<MediaPlayer className="mt-2" src={block.url} mustLoad={mustLoadMedia} />)
          break
        }
        case 'reference': {
          if ('id' in block.pointer) {
            nodes.push(<EmbeddedNote noteId={neventEncode(block.pointer)} className="mt-2" />)
          } else if ('identifier' in block.pointer) {
            nodes.push(<EmbeddedNote noteId={naddrEncode(block.pointer)} className="mt-2" />)
          } else {
            nodes.push(<EmbeddedMention userId={nprofileEncode(block.pointer)} />)
          }
          break
        }
        case 'hashtag': {
          nodes.push(<EmbeddedHashtag hashtag={block.value} />)
          break
        }
        case 'emoji': {
          nodes.push(<Emoji classNames={{ img: 'mb-1' }} emoji={block} />)
          break
        }
      }
    }

    return nodes
  }, [translatedEvent ?? event ?? content])

  return <div className={cn('text-wrap break-words whitespace-pre-wrap', className)}>{nodes}</div>
}
