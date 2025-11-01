import { userIdToPubkey } from '@/lib/pubkey'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { NostrUser } from '@nostr/gadgets/metadata'
import { useEffect, useState } from 'react'

export function useFetchProfile(id?: string) {
  const { profile: currentAccountProfile } = useNostr()
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [profile, setProfile] = useState<NostrUser | null>(null)
  const [pubkey, setPubkey] = useState<string | null>(null)

  // fetch immediately
  useEffect(() => {
    setProfile(null)
    setPubkey(null)
    ;(async () => {
      setIsFetching(true)
      try {
        if (!id) {
          setIsFetching(false)
          setError(new Error('No id provided'))
          return
        }

        const pubkey = userIdToPubkey(id)
        setPubkey(pubkey)
        const profile = await client.fetchProfile(id)
        if (profile) {
          setProfile(profile)
        }

        // subscribe to profile updates when we don't get any good data
        if (Object.keys(profile.metadata).length == 0) {
          client.addEventListener('profileFetched:' + pubkey, handleProfileFetched)
        }
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsFetching(false)
      }
    })()

    function handleProfileFetched(event: Event) {
      const customEvent = event as CustomEvent<NostrUser>
      const fetchedProfile = customEvent.detail
      setProfile(fetchedProfile)
      client.removeEventListener('profileFetched:' + pubkey, handleProfileFetched)
    }

    return () => {
      client.removeEventListener('profileFetched:' + pubkey, handleProfileFetched)
    }
  }, [id])

  useEffect(() => {
    if (currentAccountProfile && pubkey === currentAccountProfile.pubkey) {
      setProfile(currentAccountProfile)
    }
  }, [currentAccountProfile, pubkey])

  return { isFetching, error, profile }
}
