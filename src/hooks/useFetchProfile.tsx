import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { bareNostrUser, NostrUser } from '@nostr/gadgets/metadata'
import { useEffect, useState } from 'react'

export function useFetchProfile(input?: string) {
  const { profile: currentAccountProfile } = useNostr()
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [profile, setProfile] = useState<NostrUser | null>(null)
  const bare = input ? bareNostrUser(input) : undefined
  const resolvedProfile = bare && profile?.pubkey === bare.pubkey ? profile : null

  useEffect(() => {
    if (!input) {
      setProfile(null)
      setIsFetching(false)
      setError(new Error('No input provided'))
      return
    }

    setError(null)
    setProfile(null)

    if (currentAccountProfile && bare?.pubkey === currentAccountProfile.pubkey) {
      setProfile(currentAccountProfile)
      setIsFetching(false)
      return
    }

    setIsFetching(true)
    ;(async () => {
      try {
        const profile = await client.fetchProfile(input)
        if (profile) setProfile(profile)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsFetching(false)
      }
    })()
  }, [input, currentAccountProfile])

  return { isFetching, error, profile: resolvedProfile ?? bare }
}
