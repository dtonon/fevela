import { TDraftEvent } from '@/types'
import { BlossomClient, SignedEvent } from 'blossom-client-sdk'
import { z } from 'zod'
import client from './client.service'
import { loadBlossomServers } from '@nostr/gadgets/lists'

type UploadOptions = {
  onProgress?: (progressPercent: number) => void
  signal?: AbortSignal
}

export const UPLOAD_ABORTED_ERROR_MSG = 'Upload aborted'

class MediaUploadService {
  static instance: MediaUploadService

  private imetaTagMap = new Map<string, string[]>()

  constructor() {
    if (!MediaUploadService.instance) {
      MediaUploadService.instance = this
    }
    return MediaUploadService.instance
  }

  async upload(file: File, options?: UploadOptions) {
    const result = await this.uploadByBlossom(file, options)

    if (result.tags.length > 0) {
      this.imetaTagMap.set(result.url, ['imeta', ...result.tags.map(([n, v]) => `${n} ${v}`)])
    }
    return result
  }

  private async uploadByBlossom(file: File, options?: UploadOptions) {
    const pubkey = client.pubkey
    const signer = async (draft: TDraftEvent) => {
      if (!client.signer) {
        throw new Error('You need to be logged in to upload media')
      }
      return client.signer.signEvent(draft)
    }
    if (!pubkey) {
      throw new Error('You need to be logged in to upload media')
    }

    if (options?.signal?.aborted) {
      throw new Error(UPLOAD_ABORTED_ERROR_MSG)
    }

    options?.onProgress?.(0)

    // pseudo-progress: advance gradually until main upload completes
    let pseudoProgress = 1
    let pseudoTimer: number | undefined
    const startPseudoProgress = () => {
      if (pseudoTimer !== undefined) return
      pseudoTimer = window.setInterval(() => {
        // cap pseudo progress to 90% until we get real completion
        pseudoProgress = Math.min(pseudoProgress + 3, 90)
        options?.onProgress?.(pseudoProgress)
        if (pseudoProgress >= 90) {
          stopPseudoProgress()
        }
      }, 300)
    }
    const stopPseudoProgress = () => {
      if (pseudoTimer !== undefined) {
        clearInterval(pseudoTimer)
        pseudoTimer = undefined
      }
    }
    startPseudoProgress()

    const { items: servers } = await loadBlossomServers(pubkey)
    if (servers.length === 0) {
      throw new Error('No Blossom services available')
    }
    let successfulBlob: any = null
    let auth: SignedEvent
    const errors: { server: string; error: any }[] = []
    let successfulServer: any = null

    // try each server until one succeeds
    for (const server of servers) {
      try {
        auth = await BlossomClient.createUploadAuth(signer, file, {
          message: 'Uploading media file'
        })

        successfulBlob = await BlossomClient.uploadBlob(server, file, { auth })
        successfulServer = server

        // success, stop trying
        break
      } catch (err) {
        errors.push({ server, error: String(err) })
      }
    }

    // if none succeeded, throw an error
    if (!successfulBlob) {
      throw new Error(
        `All servers failed to upload: ${errors.map(({ server, error }) => `${server}: ${error}`)}`
      )
    }

    // main upload finished
    stopPseudoProgress()
    options?.onProgress?.(80)

    // mirror to other servers, including the ones that failed initially
    if (servers.length > 1) {
      await Promise.allSettled(
        servers
          .filter((server) => server !== successfulServer) // skip the server that succeeded
          .map(async (server) => {
            return BlossomClient.mirrorBlob(server, successfulBlob, { auth }).catch(() => {
              // if this didn't fail already, upload manually
              if (!errors.find((e) => e.server === server)) {
                return BlossomClient.uploadBlob(server, file, { auth })
              }
            })
          })
      )
    }

    let tags: string[][] = []
    const parseResult = z.array(z.array(z.string())).safeParse((successfulBlob as any).nip94 ?? [])
    if (parseResult.success) {
      tags = parseResult.data
    }

    options?.onProgress?.(100)
    return { url: successfulBlob.url, tags }
  }

  getImetaTagByUrl(url: string) {
    return this.imetaTagMap.get(url)
  }
}

const instance = new MediaUploadService()
export default instance
