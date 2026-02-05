import * as kinds from '@nostr/tools/kinds'
import { NostrEvent } from '@nostr/tools/wasm'

import client from '@/services/client.service'
import { getEmbeddedPubkeys, getParentETag, isMentioningMutedUsers } from './event'
import { tagNameEquals } from './tag'
import { ExtendedKind } from '@/constants'

export function notificationFilter(
  event: NostrEvent,
  {
    pubkey,
    mutePubkeySet,
    hideContentMentioningMutedUsers,
    hideUntrustedNotifications,
    isUserTrusted
  }: {
    pubkey?: string | null
    mutePubkeySet: Set<string>
    hideContentMentioningMutedUsers?: boolean
    hideUntrustedNotifications?: boolean
    isUserTrusted: (pubkey: string) => boolean
  }
): boolean {
  if (
    mutePubkeySet.has(event.pubkey) ||
    (hideContentMentioningMutedUsers && isMentioningMutedUsers(event, mutePubkeySet)) ||
    (hideUntrustedNotifications && !isUserTrusted(event.pubkey))
  ) {
    return false
  }

  if (pubkey && event.kind === kinds.Reaction) {
    const targetPubkey = event.tags.findLast(tagNameEquals('p'))?.[1]
    if (targetPubkey !== pubkey) return false
  }

  return true
}

export const replyKinds = [
  kinds.ShortTextNote,
  ExtendedKind.COMMENT,
  ExtendedKind.VOICE_COMMENT,
  ExtendedKind.POLL_RESPONSE
]

export const reactionKinds = [kinds.Repost, kinds.Reaction, kinds.Zap]

// check if an event is a mention (explicit mention or direct reply)
export async function isMention(event: NostrEvent, pubkey: string): Promise<boolean> {
  // Check explicit mentions in content
  const embeddedPubkeys = getEmbeddedPubkeys(event)
  if (embeddedPubkeys.includes(pubkey)) {
    return true
  }

  // Check if this is a direct reply to user's note
  const parentETag = getParentETag(event)
  if (parentETag) {
    // Try to get author from e-tag hint (5th element)
    const parentAuthorFromTag = parentETag[4]
    if (parentAuthorFromTag === pubkey) {
      return true
    }

    // If no hint or hint doesn't match, fetch the parent event
    if (!parentAuthorFromTag) {
      try {
        const parentEventHexId = parentETag[1]
        const parentEvent = await client.fetchEvent(parentEventHexId)
        if (parentEvent && parentEvent.pubkey === pubkey) {
          return true
        }
      } catch (e) {
        console.debug('Could not fetch parent event for filtering:', e)
      }
    }
  }

  return false
}
