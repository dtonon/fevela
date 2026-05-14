import customEmojiService from '@/services/custom-emoji.service'
import { emojis, shortcodeToEmoji } from '@tiptap/extension-emoji'
import { Content, JSONContent } from '@tiptap/react'
import * as nip19 from '@nostr/tools/nip19'
import { formatNpub } from './pubkey'

const PROFILE_MENTION_REGEX = /(^|\s|@)(nostr:)?(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+)/g

export function parseEditorJsonToText(node?: JSONContent) {
  const text = _parseEditorJsonToText(node)
  const regex = /(^|\s+|@)(nostr:)?(nevent|naddr|nprofile|npub)1[a-zA-Z0-9]+/g

  return text
    .replace(regex, (match, leadingWhitespace) => {
      let bech32 = match.trim()
      const whitespace = leadingWhitespace || ''

      if (bech32.startsWith('@nostr:')) {
        bech32 = bech32.slice(7)
      } else if (bech32.startsWith('@')) {
        bech32 = bech32.slice(1)
      } else if (bech32.startsWith('nostr:')) {
        bech32 = bech32.slice(6)
      }

      try {
        nip19.decode(bech32)
        return `${whitespace}nostr:${bech32}`
      } catch {
        return match
      }
    })
    .trim()
}

export function parseTextToEditorContent(content?: Content): Content {
  if (!content || typeof content !== 'string') return content ?? ''

  const text = content

  const lines = text.split('\n')
  const docContent: JSONContent[] = []
  let paragraphContent: JSONContent[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (line === '') {
      if (paragraphContent.length > 0) {
        docContent.push({ type: 'paragraph', content: paragraphContent })
        paragraphContent = []
      }

      if (index < lines.length - 1) {
        docContent.push({ type: 'paragraph' })
      }

      continue
    }

    if (paragraphContent.length > 0) {
      paragraphContent.push({ type: 'hardBreak' })
    }

    paragraphContent.push(...parseTextLineToContent(line))
  }

  if (paragraphContent.length > 0) {
    docContent.push({ type: 'paragraph', content: paragraphContent })
  }

  return { type: 'doc', content: docContent.length > 0 ? docContent : [{ type: 'paragraph' }] }
}

function _parseEditorJsonToText(node?: JSONContent): string {
  if (!node) return ''

  if (typeof node === 'string') return node

  if (node.type === 'text') {
    return node.text || ''
  }

  if (node.type === 'hardBreak') {
    return '\n'
  }

  if (Array.isArray(node.content)) {
    return (
      node.content.map(_parseEditorJsonToText).join('') + (node.type === 'paragraph' ? '\n' : '')
    )
  }

  switch (node.type) {
    case 'paragraph':
      return '\n'
    case 'mention':
      return node.attrs ? `nostr:${node.attrs.id}` : ''
    case 'emoji':
      return parseEmojiNodeName(node.attrs?.name)
    default:
      return ''
  }
}

function parseEmojiNodeName(name?: string): string {
  if (!name) return ''
  if (customEmojiService.isCustomEmojiId(name)) {
    return `:${name}:`
  }
  const emoji = shortcodeToEmoji(name, emojis)
  return emoji ? (emoji.emoji ?? '') : ''
}

function parseTextLineToContent(line: string): JSONContent[] {
  const content: JSONContent[] = []
  let lastIndex = 0

  for (const match of line.matchAll(PROFILE_MENTION_REGEX)) {
    const fullMatch = match[0]
    const leading = match[1] ?? ''
    const bech32 = match[3]
    const start = match.index ?? 0
    const mentionStart = start + leading.length

    if (start > lastIndex) {
      content.push({ type: 'text', text: line.slice(lastIndex, start) })
    }

    if (leading) {
      content.push({ type: 'text', text: leading })
    }

    const mention = parseProfileMention(bech32)
    if (mention) {
      content.push(mention)
    } else {
      content.push({ type: 'text', text: fullMatch.slice(leading.length) })
    }

    lastIndex = mentionStart + fullMatch.slice(leading.length).length
  }

  if (lastIndex < line.length) {
    content.push({ type: 'text', text: line.slice(lastIndex) })
  }

  return content.length > 0 ? content : [{ type: 'text', text: '' }]
}

function parseProfileMention(bech32: string): JSONContent | undefined {
  try {
    const decoded = nip19.decode(bech32)

    if (decoded.type === 'npub') {
      return {
        type: 'mention',
        attrs: {
          id: bech32,
          label: formatNpub(bech32)
        }
      }
    }

    if (decoded.type === 'nprofile') {
      const npub = nip19.npubEncode(decoded.data.pubkey)
      return {
        type: 'mention',
        attrs: {
          id: npub,
          label: formatNpub(npub)
        }
      }
    }
  } catch {
    return undefined
  }

  return undefined
}
