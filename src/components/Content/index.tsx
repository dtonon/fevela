import { useTranslatedEvent } from '@/hooks'
import { LINK_PREVIEW_MODE, YOUTUBE_URL_REGEX } from '@/constants'
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

          nodes.push(<span key={nodes.length}>{block.text}</span>)
          break
        }
        case 'url': {
          nodes.push(<ExternalLink key={nodes.length} url={block.url} />)
          if (linkPreviewMode === LINK_PREVIEW_MODE.ENABLED) {
            if (block.url.match(YOUTUBE_URL_REGEX)) {
              nodes.push(
                <YoutubeEmbeddedPlayer
                  key={nodes.length}
                  url={block.url}
                  className="mt-2"
                  mustLoad={mustLoadMedia}
                />
              )
            } else {
              nodes.push(<WebPreview key={nodes.length} className="mt-2" url={block.url} />)
            }
          }
          break
        }
        case 'relay': {
          nodes.push(<EmbeddedWebsocketUrl key={nodes.length} url={block.url} />)
          break
        }
        case 'image': {
          if (nodes.length > 0 && (nodes[nodes.length - 1].type as any).name === 'ImageGallery') {
            nodes[nodes.length - 1] = (
              <ImageGallery
                key={nodes[nodes.length - 1].key}
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
                key={nodes.length}
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
        case 'video':
        case 'audio': {
          nodes.push(
            <MediaPlayer
              key={nodes.length}
              className="mt-2"
              src={block.url}
              mustLoad={mustLoadMedia}
            />
          )
          break
        }
        case 'reference': {
          if ('id' in block.pointer) {
            nodes.push(
              <EmbeddedNote
                key={nodes.length}
                noteId={neventEncode(block.pointer)}
                className="mt-2"
              />
            )
          } else if ('identifier' in block.pointer) {
            nodes.push(
              <EmbeddedNote
                key={nodes.length}
                noteId={naddrEncode(block.pointer)}
                className="mt-2"
              />
            )
          } else {
            nodes.push(
              <EmbeddedMention key={nodes.length} userId={nprofileEncode(block.pointer)} />
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
  }, [translatedEvent ?? event ?? content])

  return <div className={cn('text-wrap break-words whitespace-pre-wrap', className)}>{nodes}</div>
}
