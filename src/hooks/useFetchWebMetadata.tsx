import { TWebMetadata } from '@/types'
import { useEffect, useState } from 'react'
import webService from '@/services/web.service'

export function useFetchWebMetadata(url: string) {
  const [metadata, setMetadata] = useState<TWebMetadata>({})
  const [isLoading, setIsLoading] = useState(true)
  const proxyServer = import.meta.env.VITE_PROXY_SERVER
  if (proxyServer) {
    url = `${proxyServer}/sites/${encodeURIComponent(url)}`
  }

  useEffect(() => {
    setIsLoading(true)
    webService.fetchWebMetadata(url).then((metadata) => {
      setMetadata(metadata)
      setIsLoading(false)
    })
  }, [url])

  return { ...metadata, isLoading }
}
