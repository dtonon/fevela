import { ExtendedKind } from '@/constants'
import { isMentioningMutedUsers } from '@/lib/event'
import { getKindDescription } from '@/lib/nostr-kinds-registry'
import { cn } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { Event } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CommunityDefinitionPreview from './CommunityDefinitionPreview'
import GitEventPreview from './GitEventPreview'
import GroupMetadataPreview from './GroupMetadataPreview'
import HighlightPreview from './HighlightPreview'
import LiveEventPreview from './LiveEventPreview'
import LongFormArticlePreview from './LongFormArticlePreview'
import NormalContentPreview from './NormalContentPreview'
import PictureNotePreview from './PictureNotePreview'
import PollPreview from './PollPreview'
import VideoNotePreview from './VideoNotePreview'
import WebBookmarkPreview from './WebBookmarkPreview'

export default function ContentPreview({
  event,
  className
}: {
  event?: Event
  className?: string
}) {
  const { t } = useTranslation()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const [kindDescription, setKindDescription] = useState(event ? `Kind ${event.kind}` : '')
  const isMuted = useMemo(
    () => (event ? mutePubkeySet.has(event.pubkey) : false),
    [mutePubkeySet, event]
  )
  const isMentioningMuted = useMemo(
    () =>
      hideContentMentioningMutedUsers && event
        ? isMentioningMutedUsers(event, mutePubkeySet)
        : false,
    [event, mutePubkeySet]
  )

  useEffect(() => {
    if (!event) {
      return
    }
    let isActive = true
    setKindDescription(`Kind ${event.kind}`)
    getKindDescription(event.kind)
      .then((description) => {
        if (isActive) {
          setKindDescription(description)
        }
      })
      .catch(() => undefined)
    return () => {
      isActive = false
    }
  }, [event])

  if (!event) {
    return <div className={cn('pointer-events-none', className)}>{`[${t('Note not found')}]`}</div>
  }

  if (isMuted) {
    return (
      <div className={cn('pointer-events-none', className)}>[{t('This user has been muted')}]</div>
    )
  }

  if (isMentioningMuted) {
    return (
      <div className={cn('pointer-events-none', className)}>
        [{t('This note mentions a user you muted')}]
      </div>
    )
  }

  switch (event.kind) {
    case kinds.ShortTextNote:
    case ExtendedKind.COMMENT:
    case ExtendedKind.VOICE:
    case ExtendedKind.VOICE_COMMENT:
    case ExtendedKind.RELAY_REVIEW:
      return <NormalContentPreview event={event} className={className} />

    case ExtendedKind.GIT_PATCH:
    case ExtendedKind.GIT_PULL_REQUEST:
    case ExtendedKind.GIT_PULL_REQUEST_UPDATE:
    case ExtendedKind.GIT_ISSUE:
    case ExtendedKind.GIT_STATUS_OPEN:
    case ExtendedKind.GIT_STATUS_APPLIED:
    case ExtendedKind.GIT_STATUS_CLOSED:
    case ExtendedKind.GIT_STATUS_DRAFT:
    case ExtendedKind.GIT_GRASP_LIST:
    case ExtendedKind.GIT_REPOSITORY_ANNOUNCEMENT:
    case ExtendedKind.GIT_REPOSITORY_STATE:
      return <GitEventPreview event={event} className={className} />

    case kinds.Highlights:
      return <HighlightPreview event={event} className={className} />

    case ExtendedKind.POLL:
      return <PollPreview event={event} className={className} />

    case kinds.LongFormArticle:
      return <LongFormArticlePreview event={event} className={className} />

    case ExtendedKind.VIDEO || event.kind === ExtendedKind.SHORT_VIDEO:
      return <VideoNotePreview event={event} className={className} />

    case ExtendedKind.PICTURE:
      return <PictureNotePreview event={event} className={className} />

    case ExtendedKind.GROUP_METADATA:
      return <GroupMetadataPreview event={event} className={className} />

    case ExtendedKind.WEB_BOOKMARK:
      return <WebBookmarkPreview event={event} className={className} />

    case kinds.CommunityDefinition:
      return <CommunityDefinitionPreview event={event} className={className} />

    case kinds.LiveEvent:
      return <LiveEventPreview event={event} className={className} />
  }

  return <div className={className}>[{kindDescription || `Kind ${event.kind}`}]</div>
}
