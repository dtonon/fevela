import { TSearchParams } from '@/types'
import NormalFeed from '../NormalFeed'
import Profile from '../Profile'
import { ProfileListBySearch } from '../ProfileListBySearch'
import Relay from '../Relay'
import TrendingNotes from '../TrendingNotes'
import { useMemo } from 'react'

export default function SearchResult({ searchParams }: { searchParams: TSearchParams | null }) {
  const notesSubRequests = useMemo(
    () =>
      searchParams?.type === 'notes'
        ? [
            {
              source: 'relays' as const,
              urls: window.fevela.universe.searchableRelayUrls,
              filter: { search: searchParams.search }
            }
          ]
        : [],
    [searchParams]
  )

  const hashtagSubRequests = useMemo(
    () =>
      searchParams?.type === 'hashtag'
        ? [
            {
              source: 'relays' as const,
              urls: window.fevela.universe.bigRelayUrls,
              filter: { '#t': [searchParams.search] }
            }
          ]
        : [],
    [searchParams]
  )

  if (!searchParams) {
    return <TrendingNotes />
  }
  if (searchParams.type === 'profile') {
    return <Profile id={searchParams.search} />
  }
  if (searchParams.type === 'profiles') {
    return <ProfileListBySearch search={searchParams.search} />
  }
  if (searchParams.type === 'notes') {
    return <NormalFeed subRequests={notesSubRequests} showRelayCloseReason />
  }
  if (searchParams.type === 'hashtag') {
    return <NormalFeed subRequests={hashtagSubRequests} showRelayCloseReason />
  }
  return <Relay url={searchParams.search} />
}
