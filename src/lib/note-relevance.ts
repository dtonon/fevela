import { TNoteStats } from '@/services/note-stats.service'

export type TNoteRelevanceScore = {
  score: number
  reactionsCount: number
  repostsCount: number
  zappedSats: number
  repliesCount: number
}

/**
 * Calculate relevance score for a note based on interactions
 * Formula: reactions + reposts*3 + zappedSats/10 + replies*4
 */
export function calculateRelevanceScore(
  stats?: Partial<TNoteStats>,
  repliesCount: number = 0
): TNoteRelevanceScore {
  const reactionsCount = stats?.likes?.length ?? 0
  const repostsCount = stats?.reposts?.length ?? 0
  const zappedSats = stats?.zaps?.reduce((sum, zap) => sum + zap.amount, 0) ?? 0

  const score =
    reactionsCount + repostsCount * 3 + zappedSats / 10 + repliesCount * 4

  return {
    score,
    reactionsCount,
    repostsCount,
    zappedSats,
    repliesCount
  }
}
