import { base64 } from '@scure/base'
import * as kinds from '@nostr/tools/kinds'
import { isBlurhashValid } from 'blurhash'
import { TImetaInfo } from '@/types'
import * as nip19 from '@nostr/tools/nip19'
import { isValidPubkey } from './pubkey'
import { NostrEvent } from '@nostr/tools/core'

export function isSameTag(tag1: string[], tag2: string[]) {
  if (tag1.length !== tag2.length) return false
  for (let i = 0; i < tag1.length; i++) {
    if (tag1[i] !== tag2[i]) return false
  }
  return true
}

export function tagNameEquals(tagName: string) {
  return (tag: string[]) => tag[0] === tagName
}

export function generateBech32IdFromETag(tag: string[]) {
  try {
    const [, id, relay, markerOrPubkey, pubkey] = tag
    let author: string | undefined
    if (markerOrPubkey && isValidPubkey(markerOrPubkey)) {
      author = markerOrPubkey
    } else if (pubkey && isValidPubkey(pubkey)) {
      author = pubkey
    }
    return nip19.neventEncode({ id, relays: relay ? [relay] : undefined, author })
  } catch {
    return undefined
  }
}

export function generateBech32IdFromATag(tag: string[]) {
  try {
    const [, coordinate, relay] = tag
    const [kind, pubkey, ...items] = coordinate.split(':')
    const identifier = items.join(':')
    return nip19.naddrEncode({
      kind: Number(kind),
      pubkey,
      identifier,
      relays: relay ? [relay] : undefined
    })
  } catch {
    return undefined
  }
}

export function getImetaInfoFromImetaTag(tag: string[], pubkey?: string): TImetaInfo | null {
  if (tag[0] !== 'imeta') return null

  const imeta: Partial<TImetaInfo> = { pubkey }

  for (let i = 1; i < tag.length; i++) {
    const [k, v] = tag[i].split(' ')
    switch (k) {
      case 'url':
        imeta.url = v
        break
      case 'thumbhash':
        try {
          imeta.thumbHash = base64.decode(v)
        } catch {
          /***/
        }
        break
      case 'blurhash':
        const validRes = isBlurhashValid(v)
        if (validRes.result) {
          imeta.blurHash = v
        }
        break
      case 'dim':
        const [width, height] = v.split('x').map(Number)
        if (width && height) {
          imeta.dim = { width, height }
        }
        break
    }
  }

  if (!imeta.url) return null
  return imeta as TImetaInfo
}

// getActualId returns the id of the inner event in case of a repost, otherwise the event id normally
export function getActualId(event: NostrEvent): string {
  return event.kind === kinds.Repost || kinds.GenericRepost
    ? event.tags.find((t) => t[0] === 'e')?.[1] || event.id
    : event.id
}
