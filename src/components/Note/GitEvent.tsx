import { ExtendedKind } from '@/constants'
import { SecondaryPageLink } from '@/PageManager'
import { toNote } from '@/lib/link'
import { cn } from '@/lib/utils'
import { naddrEncode } from '@nostr/tools/nip19'
import { Event } from '@nostr/tools/wasm'
import Content from '../Content'
import ExternalLink from '../ExternalLink'
import Username from '../Username'

type Detail = {
  label: string
  values: string[]
  link?: boolean
  repository?: boolean
  user?: boolean
}

type GitEventData = {
  kindName: string
  title: string
  details: Detail[]
}

function renderGitEventData(event: Event): GitEventData | null {
  switch (event.kind) {
    case ExtendedKind.GIT_REPOSITORY_ANNOUNCEMENT: {
      let repoId: string | undefined
      let name: string | undefined
      let description: string | undefined
      const web: string[] = []
      const clone: string[] = []
      const relays: string[] = []
      const maintainers: string[] = []
      const topics: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'd' && !repoId) repoId = values[0]
        if (tagName === 'name' && !name) name = values[0]
        if (tagName === 'description' && !description) description = values[0]
        if (tagName === 'web') for (const value of values) if (value) web.push(value)
        if (tagName === 'clone') for (const value of values) if (value) clone.push(value)
        if (tagName === 'relays') for (const value of values) if (value) relays.push(value)
        if (tagName === 'maintainers')
          for (const value of values) if (value) maintainers.push(value)
        if (tagName === 't') for (const value of values) if (value) topics.push(value)
      }

      return {
        kindName: 'Repository announcement',
        title: name || repoId || 'Repository announcement',
        details: [
          { label: 'Repo ID', values: repoId ? [repoId] : [] },
          { label: 'Description', values: description ? [description] : [] },
          { label: 'Web', values: web, link: true },
          { label: 'Clone', values: clone, link: true },
          { label: 'Relays', values: relays },
          { label: 'Maintainers', values: maintainers, user: true },
          { label: 'Topics', values: topics }
        ]
      }
    }
    case ExtendedKind.GIT_REPOSITORY_STATE: {
      let repoId: string | undefined
      const head: string[] = []
      const refs: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'd' && !repoId) repoId = values[0]
        if (tagName === 'HEAD') for (const value of values) if (value) head.push(value)
        if (tagName.startsWith('refs/') && values[0]) refs.push(`${tagName}: ${values[0]}`)
      }

      return {
        kindName: 'Repository state',
        title: repoId || 'Repository state',
        details: [
          { label: 'Repo ID', values: repoId ? [repoId] : [] },
          { label: 'HEAD', values: head },
          { label: 'Refs', values: refs }
        ]
      }
    }
    case ExtendedKind.GIT_PATCH: {
      let subject: string | undefined
      const repositories: string[] = []
      const commits: string[] = []
      const parentCommits: string[] = []
      const topics: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
        if (tagName === 'a') for (const value of values) if (value) repositories.push(value)
        if (tagName === 'commit') for (const value of values) if (value) commits.push(value)
        if (tagName === 'parent-commit')
          for (const value of values) if (value) parentCommits.push(value)
        if (tagName === 't') for (const value of values) if (value) topics.push(value)
      }

      return {
        kindName: 'Patch',
        title: subject || 'Patch',
        details: [
          { label: 'Repository', values: repositories, repository: true },
          { label: 'Commit', values: commits },
          { label: 'Parent commit', values: parentCommits },
          { label: 'Topics', values: topics }
        ]
      }
    }
    case ExtendedKind.GIT_PULL_REQUEST: {
      let subject: string | undefined
      const repositories: string[] = []
      const branches: string[] = []
      const commits: string[] = []
      const mergeBases: string[] = []
      const clone: string[] = []
      const labels: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
        if (tagName === 'a') for (const value of values) if (value) repositories.push(value)
        if (tagName === 'branch-name') for (const value of values) if (value) branches.push(value)
        if (tagName === 'c') for (const value of values) if (value) commits.push(value)
        if (tagName === 'merge-base') for (const value of values) if (value) mergeBases.push(value)
        if (tagName === 'clone') for (const value of values) if (value) clone.push(value)
        if (tagName === 't') for (const value of values) if (value) labels.push(value)
      }

      return {
        kindName: 'Pull request',
        title: subject || 'Pull request',
        details: [
          { label: 'Repository', values: repositories, repository: true },
          { label: 'Branch', values: branches },
          { label: 'Commit', values: commits },
          { label: 'Merge base', values: mergeBases },
          { label: 'Clone', values: clone, link: true },
          { label: 'Labels', values: labels }
        ]
      }
    }
    case ExtendedKind.GIT_PULL_REQUEST_UPDATE: {
      const repositories: string[] = []
      const pullRequests: string[] = []
      const commits: string[] = []
      const mergeBases: string[] = []
      const clone: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'a') for (const value of values) if (value) repositories.push(value)
        if (tagName === 'E') for (const value of values) if (value) pullRequests.push(value)
        if (tagName === 'c') for (const value of values) if (value) commits.push(value)
        if (tagName === 'merge-base') for (const value of values) if (value) mergeBases.push(value)
        if (tagName === 'clone') for (const value of values) if (value) clone.push(value)
      }

      return {
        kindName: 'Pull request update',
        title: 'Pull request update',
        details: [
          { label: 'Repository', values: repositories, repository: true },
          { label: 'Pull request', values: pullRequests },
          { label: 'Commit', values: commits },
          { label: 'Merge base', values: mergeBases },
          { label: 'Clone', values: clone, link: true }
        ]
      }
    }
    case ExtendedKind.GIT_ISSUE: {
      let subject: string | undefined
      const repositories: string[] = []
      const labels: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'subject' && !subject) subject = values[0]
        if (tagName === 'a') for (const value of values) if (value) repositories.push(value)
        if (tagName === 't') for (const value of values) if (value) labels.push(value)
      }

      return {
        kindName: 'Issue',
        title: subject || 'Issue',
        details: [
          { label: 'Repository', values: repositories, repository: true },
          { label: 'Labels', values: labels }
        ]
      }
    }
    case ExtendedKind.GIT_STATUS_OPEN:
    case ExtendedKind.GIT_STATUS_APPLIED:
    case ExtendedKind.GIT_STATUS_CLOSED:
    case ExtendedKind.GIT_STATUS_DRAFT: {
      const repositories: string[] = []
      const rootEvents: string[] = []
      const mergeCommits: string[] = []
      const appliedCommits: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'a') for (const value of values) if (value) repositories.push(value)
        if (tagName === 'e') for (const value of values) if (value) rootEvents.push(value)
        if (tagName === 'merge-commit')
          for (const value of values) if (value) mergeCommits.push(value)
        if (tagName === 'applied-as-commits')
          for (const value of values) if (value) appliedCommits.push(value)
      }

      return {
        kindName:
          event.kind === ExtendedKind.GIT_STATUS_OPEN
            ? 'Open status'
            : event.kind === ExtendedKind.GIT_STATUS_APPLIED
              ? 'Applied / resolved status'
              : event.kind === ExtendedKind.GIT_STATUS_CLOSED
                ? 'Closed status'
                : 'Draft status',
        title:
          event.kind === ExtendedKind.GIT_STATUS_OPEN
            ? 'Open'
            : event.kind === ExtendedKind.GIT_STATUS_APPLIED
              ? 'Applied / resolved'
              : event.kind === ExtendedKind.GIT_STATUS_CLOSED
                ? 'Closed'
                : 'Draft',
        details: [
          { label: 'Repository', values: repositories, repository: true },
          { label: 'Root event', values: rootEvents },
          { label: 'Merge commit', values: mergeCommits },
          { label: 'Applied commits', values: appliedCommits }
        ]
      }
    }
    case ExtendedKind.GIT_GRASP_LIST: {
      const servers: string[] = []

      for (const [tagName, ...values] of event.tags) {
        if (tagName === 'g') for (const value of values) if (value) servers.push(value)
      }

      return {
        kindName: 'User grasp list',
        title: 'User grasp list',
        details: [{ label: 'Servers', values: servers }]
      }
    }
    default:
      return null
  }
}

export default function GitEvent({ event, className }: { event: Event; className?: string }) {
  const gitEventData = renderGitEventData(event)

  if (!gitEventData) {
    return null
  }

  const details = gitEventData.details.filter((detail) => detail.values.length > 0)
  const hasContent = event.content.trim().length > 0

  const renderRepositoryLink = (value: string) => {
    const [kind, pubkey, ...identifierParts] = value.split(':')
    const identifier = identifierParts.join(':')

    if (!kind || !pubkey || !identifier) {
      return value
    }

    const shortValue = `${kind}:${pubkey.slice(0, 8)}:${identifier}`
    const naddr = naddrEncode({ kind: Number(kind), pubkey, identifier })

    return (
      <SecondaryPageLink
        to={toNote(naddr)}
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {shortValue}
      </SecondaryPageLink>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="font-medium">{gitEventData.kindName}</div>
      {gitEventData.title !== gitEventData.kindName && (
        <div className="text-sm text-muted-foreground font-medium">{gitEventData.title}</div>
      )}
      {details.length > 0 && (
        <div className="space-y-1 text-sm text-muted-foreground">
          {details.map((detail) => (
            <div key={detail.label}>
              <span className="font-medium text-foreground">{detail.label}: </span>
              {detail.values.map((value, index) => (
                <span key={`${detail.label}-${value}-${index}`}>
                  {index > 0 && <span>, </span>}
                  {detail.link ? (
                    <ExternalLink url={value} />
                  ) : detail.repository ? (
                    renderRepositoryLink(value)
                  ) : detail.user ? (
                    <Username
                      userId={value}
                      showAt
                      className="inline-block"
                      skeletonClassName="inline-block h-4"
                    />
                  ) : (
                    value
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {hasContent && <Content event={event} />}
    </div>
  )
}
