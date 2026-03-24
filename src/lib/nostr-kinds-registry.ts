const REGISTRY_URL =
  'https://cdn.jsdelivr.net/gh/nostr-protocol/registry-of-kinds@master/schema.yaml'

type KindRegistry = {
  kinds: Record<string, { description?: string }>
}

let registryCache: KindRegistry | null = null
let registryPromise: Promise<KindRegistry | null> | null = null

export async function loadKindsRegistry(): Promise<KindRegistry | null> {
  if (registryCache) return registryCache

  if (!registryPromise) {
    registryPromise = fetch(REGISTRY_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch kinds registry: ${response.status}`)
        }
        const yaml = (await import(
          // @ts-expect-error we declare this module's interface so stop complaining you can't find types
          'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs'
        )) as { load: (_: string) => any }
        const data = yaml.load(await response.text())
        if (!data || typeof data !== 'object') {
          return { kinds: {} }
        }

        const kindsValue = (data as { kinds?: unknown }).kinds
        if (!kindsValue || typeof kindsValue !== 'object') {
          return { kinds: {} }
        }

        return { kinds: kindsValue as Record<string, { description?: string }> }
      })
      .catch((error) => {
        console.error('Failed to load kinds registry:', error)
        return null
      })
  }

  const data = await registryPromise
  if (data) {
    registryCache = data
  }
  return data
}

export async function getKindDescription(kind: number): Promise<string> {
  const data = await loadKindsRegistry()
  const description = data?.kinds?.[`${kind}`]?.description
  if (description && description.trim()) {
    return description.trim()
  }
  return `Kind ${kind}`
}
