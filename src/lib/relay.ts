import { TRelayInfo } from '@/types'

export function checkSearchRelay(relayInfo: TRelayInfo | undefined) {
  return relayInfo?.supported_nips?.includes(50)
}

export function checkNip43Support(relayInfo: TRelayInfo | undefined) {
  return relayInfo?.supported_nips?.includes(43) && !!relayInfo.pubkey
}
