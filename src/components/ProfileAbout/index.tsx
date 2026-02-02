import { parse } from '@nostr/tools/nip27'
import { neventEncode, naddrEncode, nprofileEncode } from '@nostr/tools/nip19'
import { detectLanguage } from '@/lib/utils'
import { useTranslationService } from '@/providers/TranslationServiceProvider'
import { ReactElement, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EmbeddedHashtag, EmbeddedMention, EmbeddedWebsocketUrl } from '../Embedded'
import ExternalLink from '../ExternalLink'

export default function ProfileAbout({ about, className }: { about?: string; className?: string }) {
  const { t, i18n } = useTranslation()
  const { translateText } = useTranslationService()
  const needTranslation = useMemo(() => {
    const detected = detectLanguage(about)
    if (!detected) return false
    if (detected === 'und') return true
    return !i18n.language.startsWith(detected)
  }, [about, i18n.language])
  const [translatedAbout, setTranslatedAbout] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)

  const aboutNodes = useMemo(() => {
    if (!about) return null

    const nodes: ReactElement[] = []
    for (const block of parse(translatedAbout ?? about)) {
      switch (block.type) {
        case 'text': {
          nodes.push(<span key={nodes.length}>{block.text}</span>)
          break
        }
        case 'emoji': {
          nodes.push(<span key={nodes.length}>:{block.shortcode}:</span>)
          break
        }
        case 'url':
        case 'image':
        case 'video':
        case 'audio': {
          nodes.push(<ExternalLink key={nodes.length} url={block.url} />)
          break
        }
        case 'relay': {
          nodes.push(<EmbeddedWebsocketUrl key={nodes.length} url={block.url} />)
          break
        }
        case 'reference': {
          if ('id' in block.pointer) {
            nodes.push(<ExternalLink key={nodes.length} url={neventEncode(block.pointer)} />)
          } else if ('identifier' in block.pointer) {
            nodes.push(<ExternalLink key={nodes.length} url={naddrEncode(block.pointer)} />)
          } else {
            nodes.push(
              <EmbeddedMention key={nodes.length} userId={nprofileEncode(block.pointer)} />
            )
          }
          nodes.push(<span key={nodes.length}> </span>)
          break
        }
        case 'hashtag': {
          nodes.push(<EmbeddedHashtag key={nodes.length} hashtag={block.value} />)
          nodes.push(<span key={nodes.length}> </span>)
          break
        }
      }
    }

    return nodes
  }, [about, translatedAbout])

  const handleTranslate = async () => {
    if (translating || translatedAbout) return
    setTranslating(true)
    translateText(about ?? '')
      .then((translated) => {
        setTranslatedAbout(translated)
      })
      .catch((error) => {
        toast.error(
          'Translation failed: ' +
            (error.message || 'An error occurred while translating the about')
        )
      })
      .finally(() => {
        setTranslating(false)
      })
  }

  const handleShowOriginal = () => {
    setTranslatedAbout(null)
  }

  return (
    <div>
      <div className={className}>{aboutNodes}</div>
      {needTranslation && (
        <div className="mt-2 text-sm">
          {translating ? (
            <div className="text-muted-foreground">{t('Translating...')}</div>
          ) : translatedAbout === null ? (
            <button
              className="text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                handleTranslate()
              }}
            >
              {t('Translate')}
            </button>
          ) : (
            <button
              className="text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                handleShowOriginal()
              }}
            >
              {t('Show original')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
