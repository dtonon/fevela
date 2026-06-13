import { useSecondaryPage } from '@/PageManager'
import { ExtendedKind } from '@/constants'
import { getEventThreadBech32Ids, isNsfwEvent } from '@/lib/event'
import { toNote } from '@/lib/link'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Event } from '@nostr/tools/wasm'
import * as kinds from '@nostr/tools/kinds'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import AudioPlayer from '../AudioPlayer'
import ClientTag from '../ClientTag'
import Content from '../Content'
import ContentPreview from '../ContentPreview'
import FollowingBadge from '../FollowingBadge'
import PinBuryBadge from '../PinBuryBadge'
import ProtectedBadge from '../ProtectedBadge'
import { FormattedTimestamp } from '../FormattedTimestamp'
import Nip05 from '../Nip05'
import NoteOptions from '../NoteOptions'
import ParentNotePreview from '../ParentNotePreview'
import TranslateButton from '../TranslateButton'
import UserAvatar from '../UserAvatar'
import Username from '../Username'
import PendingUndoButton from '../PendingUndoButton'
import CommunityDefinition from './CommunityDefinition'
import GitEvent from './GitEvent'
import GroupMetadata from './GroupMetadata'
import Highlight from './Highlight'
import IValue from './IValue'
import LiveEvent from './LiveEvent'
import LongFormArticle from './LongFormArticle'
import LongFormArticlePreview from './LongFormArticlePreview'
import MutedNote from './MutedNote'
import NsfwNote from './NsfwNote'
import PictureNote from './PictureNote'
import Poll from './Poll'
import RelayReview from './RelayReview'
import UnknownNote from './UnknownNote'
import VideoNote from './VideoNote'
import WebBookmark from './WebBookmark'
import { npubEncode } from '@nostr/tools/nip19'

export default function Note({
  event,
  originalNoteId,
  size = 'normal',
  className,
  hideParentNotePreview = false,
  showFull = false,
  hideHeader = false,
  simple = false,
  displayScore
}: {
  event: Event
  originalNoteId?: string
  size?: 'normal' | 'small'
  className?: string
  displayScore?: number
  hideParentNotePreview?: boolean
  showFull?: boolean
  hideHeader?: boolean
  simple?: boolean
}) {
  const { push } = useSecondaryPage()
  const { isSmallScreen } = useScreenSize()
  const { defaultShowNsfw } = useContentPolicy()
  const [showNsfw, setShowNsfw] = useState(false)
  const { mutePubkeySet } = useMuteList()
  const [showMuted, setShowMuted] = useState(false)
  const parentId = hideParentNotePreview ? undefined : getEventThreadBech32Ids(event).parentId

  let content: React.ReactNode
  if (simple) {
    content = (
      <div className="mt-2 truncate">
        <ContentPreview event={event} />
      </div>
    )
  } else if (mutePubkeySet.has(event.pubkey) && !showMuted) {
    content = <MutedNote show={() => setShowMuted(true)} />
  } else if (!defaultShowNsfw && isNsfwEvent(event) && !showNsfw) {
    content = <NsfwNote show={() => setShowNsfw(true)} />
  } else {
    switch (event.kind) {
      case kinds.ShortTextNote:
      case kinds.Comment:
        content = <Content className="mt-2" event={event} />
        break
      case kinds.Highlights:
        content = <Highlight className="mt-2" event={event} />
        break
      case kinds.LongFormArticle:
        content = showFull ? (
          <LongFormArticle className="mt-2" event={event} />
        ) : (
          <LongFormArticlePreview className="mt-2" event={event} />
        )
        break
      case kinds.LiveEvent:
        content = <LiveEvent className="mt-2" event={event} />
        break
      case ExtendedKind.GROUP_METADATA:
        content = <GroupMetadata className="mt-2" event={event} originalNoteId={originalNoteId} />
        break
      case kinds.CommunityDefinition:
        content = <CommunityDefinition className="mt-2" event={event} />
        break
      case ExtendedKind.POLL:
        content = (
          <>
            <Content className="mt-2" event={event} />
            <Poll className="mt-2" event={event} />
          </>
        )
        break
      case ExtendedKind.VOICE:
      case ExtendedKind.VOICE_COMMENT:
        content = <AudioPlayer className="mt-2" src={event.content} />
        break
      case ExtendedKind.PICTURE:
        content = <PictureNote className="mt-2" event={event} />
        break
      case ExtendedKind.VIDEO:
      case ExtendedKind.SHORT_VIDEO:
        content = <VideoNote className="mt-2" event={event} />
        break
      case ExtendedKind.RELAY_REVIEW:
        content = <RelayReview className="mt-2" event={event} />
        break
      case ExtendedKind.WEB_BOOKMARK:
        content = <WebBookmark className="mt-2" event={event} />
        break
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
        content = <GitEvent className="mt-2" event={event} />
        break
      case ExtendedKind.PUBLIC_MESSAGE:
        const recipient = event.tags.find((t) => t[0] === 'p')
        if (recipient) {
          event.content = `nostr:${npubEncode(recipient[1])}` + event.content
          content = (
            <>
              <div className="text-sm text-muted-foreground font-medium">Public Message</div>
              <Content className="mt-2" event={event} />
            </>
          )
        }
        break
      default:
        content = <UnknownNote className="mt-2" event={event} />
        break
    }
  }

  return (
    <div className={className}>
      {!hideHeader && (
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center space-x-2 flex-1">
            <UserAvatar userId={event.pubkey} size={size === 'small' ? 'medium' : 'normal'} />
            <div className="flex-1 w-0">
              <div className="flex gap-2 items-center">
                <Username
                  userId={event.pubkey}
                  className={`font-semibold flex truncate ${size === 'small' ? 'text-sm' : ''}`}
                  skeletonClassName={size === 'small' ? 'h-3' : 'h-4'}
                />
                <FollowingBadge pubkey={event.pubkey} />
                <PinBuryBadge pubkey={event.pubkey} />
                <ProtectedBadge event={event} />
                <ClientTag event={event} />
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Nip05 pubkey={event.pubkey} append="·" />
                <FormattedTimestamp
                  timestamp={event.created_at}
                  className="shrink-0"
                  short={isSmallScreen}
                />
                {typeof displayScore === 'number' && (
                  <>
                    <span>·</span>
                    <span className="shrink-0 text-primary font-medium flex items-center gap-0.5">
                      <Sparkles size={14} />
                      {Math.round(displayScore)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <TranslateButton event={event} className={size === 'normal' ? '' : 'pr-0'} />
            {size === 'normal' && (
              <NoteOptions event={event} className="py-1 shrink-0 [&_svg]:size-5" />
            )}
          </div>
        </div>
      )}
      <PendingUndoButton event={event} className="mt-1" />
      {!simple && parentId && (
        <ParentNotePreview
          eventId={parentId}
          className="mt-2"
          onClick={(e) => {
            e.stopPropagation()
            push(toNote(parentId))
          }}
        />
      )}
      <IValue event={event} className="mt-2" />
      {content}
    </div>
  )
}
