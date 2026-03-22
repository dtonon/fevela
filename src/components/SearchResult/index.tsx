import { TSearchParams } from '@/types'
import Profile from '../Profile'
import { ProfileListBySearch } from '../ProfileListBySearch'
import Relay from '../Relay'
import NoteList from '../NoteList'
import { useMemo } from 'react'
import { SUPPORTED_KINDS } from '@/constants'

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
    return (
      <NoteList
        subRequests={[
          {
            source: 'relays' as const,
            urls: window.fevela.universe.trending,
            filter: {
              kinds: SUPPORTED_KINDS
            }
          }
        ]}
        showKinds={SUPPORTED_KINDS}
      />
    )
  }
  if (searchParams.type === 'profile') {
    return <Profile id={searchParams.search} />
  }
  if (searchParams.type === 'profiles') {
    return <ProfileListBySearch search={searchParams.search} />
  }
  if (searchParams.type === 'notes') {
    return <NoteList subRequests={notesSubRequests} showKinds={SUPPORTED_KINDS} />
  }
  if (searchParams.type === 'hashtag') {
    return <NoteList subRequests={hashtagSubRequests} showKinds={SUPPORTED_KINDS} />
  }
  return <Relay url={searchParams.search} />
}
