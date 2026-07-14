import './i18n'
import './index.css'
import './polyfill'
import './services/lightning.service'
import './window'
import { init as initOutbox, restart } from './services/outbox.service'

import { createRoot } from 'react-dom/client'
import { initNostrWasm } from 'nostr-wasm/gzipped'
import { setNostrWasm, verifyEvent } from '@nostr/tools/wasm'
import { pool, purgatory, setPool, setReplaceableStore } from '@nostr/gadgets/global'
import { BoundedPool } from './services/pool.service.ts'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { store } from './services/store.service.ts'

window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)
setVh()

initNostrWasm()
  .then((nw) => {
    setNostrWasm(nw)
    setPool(
      new BoundedPool({
        verifyEvent,
        enableReconnect: true,
        maxWaitForConnection: 3000,
        // without these the purgatory never learns which relays are dead, so we keep
        // retrying them forever and burn connection slots on them
        // cast: purgatory's signature refers to the DOM Event type, not NostrEvent
        allowConnectingToRelay: purgatory.allowConnectingToRelay.bind(purgatory) as (
          url: string
        ) => boolean,
        onRelayConnectionFailure: purgatory.onRelayConnectionFailure.bind(purgatory),
        onRelayConnectionSuccess: purgatory.onRelayConnectionSuccess.bind(purgatory)
      }) as any
    )
    pool.trackRelays = true
    setReplaceableStore(store)
    initOutbox()

    // try to prevent "Insufficient resources" errors
    setInterval(() => {
      const urls = pool.pruneIdleRelays()
      if (urls.length > 0) console.log(':: closed idle relays', urls)
    }, 10_000)

    window.addEventListener('online', () => {
      console.log(':: network restored, restarting relay subscriptions')
      restart()
    })

    document.addEventListener('visibilitychange', () => {
      const relays = (pool as any).relays as Map<string, { connected: boolean }>
      if (document.visibilityState === 'visible' && relays.size > 0) {
        // Wait for WebSocket close events to propagate before checking state.
        // After a tab switch relays stay connected, so this is a no-op.
        // After sleep the OS closes TCP connections and all relays show disconnected.
        setTimeout(() => {
          if (Array.from(relays.values()).every((r) => !r.connected)) {
            console.log(':: all relays disconnected after wakeup, restarting')
            restart()
          }
        }, 2000)
      }
    })

    createRoot(document.getElementById('root')!).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
  })
  .catch((error) => {
    console.error('Failed to initialize nostr-wasm:', error)

    const alertDiv = document.createElement('div')
    alertDiv.className =
      'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white p-5 rounded-lg max-w-[90%] w-[400px] text-center z-[9999] shadow-md'
    alertDiv.innerHTML = `
      <h2 class="mb-2.5 text-lg font-bold">Browser not supported</h2>
      <p>
        Your browser does not support WebAssembly, which is required to run this application.
        Please try enabling it in the settings, using a different browser, or updating your current browser.
      </p>
    `
    document.body.appendChild(alertDiv)
  })

function setVh() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`)
}
