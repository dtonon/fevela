import { getParentTag } from '@/lib/event'
import { Event } from '@nostr/tools/wasm'
import { createContext, useCallback, useContext, useState } from 'react'

type TReplyContext = {
  repliesMap: Map<string, Event[]>
  addReplies: (replies: Event[]) => void
  reset: () => void
}

const ReplyContext = createContext<TReplyContext | undefined>(undefined)

export const useReply = () => {
  const context = useContext(ReplyContext)
  if (!context) {
    throw new Error('useReply must be used within a ReplyProvider')
  }
  return context
}

export function ReplyProvider({ children }: { children: React.ReactNode }) {
  const [repliesMap, setRepliesMap] = useState<Map<string, Event[]>>(new Map())

  const addReplies = useCallback((replies: Event[]) => {
    setRepliesMap((curr) => {
      for (const reply of replies) {
        const parent = getParentTag(reply)?.tag[1] || reply.tags.find((t) => t[0] === 'q')?.[1]
        if (!parent) continue

        const prev = curr.get(parent) || []
        if (!prev.find((evt) => evt.id === reply.id)) {
          curr.set(parent, [...prev, reply])
        }
      }
      return new Map(curr)
    })
  }, [])

  return (
    <ReplyContext.Provider
      value={{
        repliesMap,
        addReplies,
        reset() {
          setRepliesMap(new Map())
        }
      }}
    >
      {children}
    </ReplyContext.Provider>
  )
}
