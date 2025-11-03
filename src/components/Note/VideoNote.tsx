import { getImetaInfosFromEvent } from '@/lib/event'
import { Event } from '@nostr/tools/wasm'
import { useMemo } from 'react'
import Content from '../Content'
import MediaPlayer from '../MediaPlayer'

export default function VideoNote({ event, className }: { event: Event; className?: string }) {
  const videoInfos = useMemo(() => getImetaInfosFromEvent(event), [event])

  return (
    <div className={className}>
      <Content event={event} />
      {videoInfos.map((video) => (
        <MediaPlayer src={video.url} key={video.url} className="mt-2" />
      ))}
    </div>
  )
}
