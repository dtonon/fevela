import { ExtendedKind } from '@/constants'
import { cn } from '@/lib/utils'
import { Event } from '@nostr/tools/wasm'

function getPreviewText(event: Event) {
  switch (event.kind) {
    case ExtendedKind.GIT_REPOSITORY_ANNOUNCEMENT: {
      let repoId: string | undefined
      let name: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'd' && !repoId) repoId = values[0]
        if (tagName === 'name' && !name) name = values[0]
      }

      return `[Repository] ${name || repoId || ''}`.trim()
    }
    case ExtendedKind.GIT_REPOSITORY_STATE: {
      let repoId: string | undefined
      let head: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'd' && !repoId) repoId = values[0]
        if (tagName === 'HEAD' && !head) head = values[0]
      }

      return `[Repository state] ${repoId || head || ''}`.trim()
    }
    case ExtendedKind.GIT_PATCH: {
      let subject: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
      }

      return `[Patch] ${subject || event.content || ''}`.trim()
    }
    case ExtendedKind.GIT_PULL_REQUEST: {
      let subject: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
      }

      return `[Pull request] ${subject || event.content || ''}`.trim()
    }
    case ExtendedKind.GIT_PULL_REQUEST_UPDATE: {
      let commit: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'c' && !commit) commit = values[0]
      }

      return `[Pull request update] ${commit || ''}`.trim()
    }
    case ExtendedKind.GIT_ISSUE: {
      let subject: string | undefined

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
      }

      return `[Issue] ${subject || event.content || ''}`.trim()
    }
    case ExtendedKind.GIT_STATUS_OPEN:
      return '[Open]'
    case ExtendedKind.GIT_STATUS_APPLIED:
      return '[Applied / resolved]'
    case ExtendedKind.GIT_STATUS_CLOSED:
      return '[Closed]'
    case ExtendedKind.GIT_STATUS_DRAFT:
      return '[Draft]'
    case ExtendedKind.GIT_GRASP_LIST:
      return '[User grasp list]'
    default:
      return ''
  }
}

export default function GitEventPreview({ event, className }: { event: Event; className?: string }) {
  return <div className={cn('pointer-events-none truncate', className)}>{getPreviewText(event)}</div>
}
