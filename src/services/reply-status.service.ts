import { isReplyNoteEvent } from '@/lib/event'
import client from '@/services/client.service'

class ReplyStatusService {
  static instance: ReplyStatusService

  private replyStatusMap = new Map<string, boolean>()
  private fetchingIds = new Set<string>()
  private listeners = new Set<() => void>()
  private version = 0

  constructor() {
    if (!ReplyStatusService.instance) {
      ReplyStatusService.instance = this
    }
    return ReplyStatusService.instance
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = () => this.version

  // Returns undefined while the referenced event is still being fetched
  isReply(eventId: string): boolean | undefined {
    const status = this.replyStatusMap.get(eventId)
    if (status !== undefined || this.fetchingIds.has(eventId)) return status

    this.fetchingIds.add(eventId)
    client
      .fetchEvent(eventId)
      .then((evt) => {
        this.replyStatusMap.set(eventId, !!evt && !!isReplyNoteEvent(evt))
        this.version++
        this.listeners.forEach((listener) => listener())
      })
      .catch(() => {
        this.replyStatusMap.set(eventId, false)
      })
      .finally(() => {
        this.fetchingIds.delete(eventId)
      })

    return undefined
  }
}

const instance = new ReplyStatusService()
export default instance
