import { useSecondaryPage } from '@/PageManager'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { toExternalContent } from '@/lib/link'
import { truncateUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { ExternalLink as ExternalLinkIcon, MessageSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export default function ExternalLink({ url, className }: { url: string; className?: string }) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const displayUrl = useMemo(() => truncateUrl(url), [url])

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(url, '_blank', 'noreferrer')
  }

  const handleViewDiscussions = (e: React.MouseEvent) => {
    e.stopPropagation()
    push(toExternalContent(url))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          className={cn('cursor-pointer text-primary hover:underline', className)}
          onClick={(e) => e.stopPropagation()}
          title={url}
        >
          {displayUrl}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleOpenLink}>
          <ExternalLinkIcon />
          {t('Open link')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewDiscussions}>
          <MessageSquare />
          {t('View Nostr discussions')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
