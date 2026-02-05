import { BIG_RELAY_URLS } from '@/constants'
import { compareEvents } from '@/lib/event'
import { isMention, notificationFilter, replyKinds, reactionKinds } from '@/lib/notification'
import { usePrimaryPage } from '@/PageManager'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { NostrEvent } from '@nostr/tools/wasm'
import { SubCloser } from '@nostr/tools/abstract-pool'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useContentPolicy } from './ContentPolicyProvider'
import { useMuteList } from './MuteListProvider'
import { useNostr } from './NostrProvider'
import { useUserTrust } from './UserTrustProvider'
import { pool } from '@nostr/gadgets/global'

type TNotificationContext = {
  hasNewNotification: boolean
  getNotificationsSeenAt: () => number
  isNotificationRead: (id: string) => boolean
  markNotificationAsRead: (id: string) => void
  hasNewConversation: boolean
}

const NotificationContext = createContext<TNotificationContext | undefined>(undefined)

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { current } = usePrimaryPage()
  const active = useMemo(() => current === 'notifications', [current])
  const { pubkey, notificationsSeenAt, updateNotificationsSeenAt } = useNostr()
  const { hideUntrustedNotifications, isUserTrusted } = useUserTrust()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const [newNotifications, setNewNotifications] = useState<NostrEvent[]>([])
  const [readNotificationIdSet, setReadNotificationIdSet] = useState<Set<string>>(new Set())
  const [filteredNewNotifications, setFilteredNewNotifications] = useState<number>(0)
  const [filteredNewConversations, setFilteredNewConversations] = useState<number>(0)

  useEffect(() => {
    if (active || notificationsSeenAt < 0 || !pubkey) {
      setFilteredNewNotifications(0)
      setFilteredNewConversations(0)
      return
    }

    ;(async () => {
      let filteredNotifications = 0
      let filteredConversations = 0

      for (const notification of newNotifications) {
        if (notification.created_at <= notificationsSeenAt) {
          break
        }
        if (
          !notificationFilter(notification, {
            pubkey,
            mutePubkeySet,
            hideContentMentioningMutedUsers,
            hideUntrustedNotifications,
            isUserTrusted
          })
        ) {
          continue
        }

        // for text-based kinds, check if it's a mention
        if (replyKinds.includes(notification.kind)) {
          // any conversation-style any-level reply goes here
          // reactions don't
          filteredConversations++

          // but they only show up as notifications if they are direct
          const isMentionResult = await isMention(notification, pubkey)
          if (isMentionResult) filteredNotifications++
        } else {
          // all other kinds get a free pass as notifications
          filteredNotifications++
        }
      }

      setFilteredNewNotifications(filteredNotifications)
      setFilteredNewConversations(filteredConversations)
    })()
  }, [
    newNotifications,
    notificationsSeenAt,
    mutePubkeySet,
    hideContentMentioningMutedUsers,
    hideUntrustedNotifications,
    isUserTrusted,
    active,
    pubkey
  ])

  useEffect(() => {
    setNewNotifications([])
    updateNotificationsSeenAt(!active)
  }, [active])

  useEffect(() => {
    if (!pubkey) return

    setNewNotifications([])
    setReadNotificationIdSet(new Set())

    // Track if component is mounted
    const isMountedRef = { current: true }
    const subCloserRef: {
      current: SubCloser | null
    } = { current: null }

    const subscribe = async () => {
      if (subCloserRef.current) {
        subCloserRef.current.close()
        subCloserRef.current = null
      }
      if (!isMountedRef.current) return null

      try {
        let eosed = false
        const relayList = await client.fetchRelayList(pubkey)
        const subCloser = pool.subscribe(
          relayList.read.length > 0 ? relayList.read.slice(0, 5) : BIG_RELAY_URLS,
          {
            kinds: [...replyKinds, ...reactionKinds],
            '#p': [pubkey],
            limit: 20
          },
          {
            label: 'f-notifications',
            oneose: () => {
              eosed = true
              setNewNotifications((prev) => {
                return [...prev.sort((a, b) => compareEvents(b, a))]
              })
            },
            onevent: (evt) => {
              if (evt.pubkey !== pubkey) {
                setNewNotifications((prev) => {
                  if (!eosed) {
                    return [evt, ...prev]
                  }
                  if (prev.length && compareEvents(prev[0], evt) >= 0) {
                    return prev
                  }

                  client.emitNewEvent(evt)
                  return [evt, ...prev]
                })
              }
            },
            onclose: (reasons) => {
              if (reasons.every((reason) => reason === 'closed by caller')) {
                return
              }

              // Only reconnect if still mounted and not a manual close
              if (isMountedRef.current) {
                setTimeout(() => {
                  if (isMountedRef.current) {
                    subscribe()
                  }
                }, 5_000)
              }
            }
          }
        )

        subCloserRef.current = subCloser
        return subCloser
      } catch (error) {
        console.error('Subscription error:', error)

        // Retry on error if still mounted
        if (isMountedRef.current) {
          setTimeout(() => {
            if (isMountedRef.current) {
              subscribe()
            }
          }, 5_000)
        }
        return null
      }
    }

    // Initial subscription
    subscribe()

    // Cleanup function
    return () => {
      isMountedRef.current = false
      if (subCloserRef.current) {
        subCloserRef.current.close()
        subCloserRef.current = null
      }
    }
  }, [pubkey])

  useEffect(() => {
    // Update title
    if (filteredNewNotifications > 0) {
      document.title = `(${filteredNewConversations > 99 ? '99+' : filteredNewConversations}) Fevela`
    } else {
      document.title = 'Fevela'
    }

    // Update favicons
    const favicons = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']")
    if (!favicons.length) return

    if (filteredNewNotifications === 0) {
      favicons.forEach((favicon) => {
        favicon.href = '/favicon.ico'
      })
    } else {
      const img = document.createElement('img')
      img.src = '/favicon.ico'
      img.onload = () => {
        const size = Math.max(img.width, img.height, 32)
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, size, size)
        const r = size * 0.16
        ctx.beginPath()
        ctx.arc(size - r - 3, r + 25, r, 0, 2 * Math.PI)
        ctx.fillStyle = '#FF0000'
        ctx.fill()
        favicons.forEach((favicon) => {
          favicon.href = canvas.toDataURL('image/png')
        })
      }
    }
  }, [filteredNewNotifications])

  return (
    <NotificationContext.Provider
      value={{
        hasNewNotification: filteredNewNotifications > 0,
        getNotificationsSeenAt,
        isNotificationRead,
        markNotificationAsRead,
        hasNewConversation: filteredNewConversations > 0
      }}
    >
      {children}
    </NotificationContext.Provider>
  )

  function getNotificationsSeenAt() {
    if (notificationsSeenAt >= 0) {
      return notificationsSeenAt
    }
    if (pubkey) {
      return storage.getLastReadNotificationTime(pubkey)
    }
    return 0
  }

  function isNotificationRead(notificationId: string): boolean {
    return readNotificationIdSet.has(notificationId)
  }

  function markNotificationAsRead(notificationId: string): void {
    setReadNotificationIdSet((prev) => new Set([...prev, notificationId]))
  }
}
