import './i18n'
import './index.css'
import './polyfill'
import './services/lightning.service'

import { createRoot } from 'react-dom/client'
import { initNostrWasm } from 'nostr-wasm/gzipped'
import { setNostrWasm, verifyEvent } from '@nostr/tools/wasm'
import { AbstractSimplePool } from '@nostr/tools/abstract-pool'
import { AbstractRelay } from '@nostr/tools/abstract-relay'
import { pool, setPool } from '@nostr/gadgets/global'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)
setVh()

initNostrWasm()
  .then((nw) => {
    setNostrWasm(nw)
    setPool(new AbstractSimplePool({ verifyEvent, enableReconnect: true }))
    pool.trackRelays = true

    // Manage relay connection pool to prevent "Insufficient resources" errors
    // Browsers limit WebSocket connections (usually 200-255 total)
    const MAX_RELAY_CONNECTIONS = 50 // More conservative limit

    setInterval(() => {
      // Access protected relays property and type it properly
      const relays = Array.from((pool as any).relays.values()) as AbstractRelay[]

      // Log current state for debugging
      const connected = relays.filter((r) => r.connected).length
      const withSubs = relays.filter((r) => r.openSubs.size > 0).length
      console.log(
        `Relay connections: ${connected}/${relays.length} connected, ${withSubs} with active subs`
      )

      // Separate idle relays into two categories
      const disconnectedIdle = relays.filter((r) => !r.connected && r.openSubs.size === 0)
      const connectedIdle = relays.filter((r) => r.connected && r.openSubs.size === 0)

      // Always close disconnected relays with no subscriptions (they're just wasting space)
      if (disconnectedIdle.length > 0) {
        const urlsToClose = disconnectedIdle.map((r) => r.url)
        pool.close(urlsToClose)
        console.log(`Closed ${urlsToClose.length} disconnected idle relays`)
      }

      // If still over limit, close connected but idle relays
      const currentCount = relays.length - disconnectedIdle.length
      if (currentCount > MAX_RELAY_CONNECTIONS) {
        const urlsToClose = connectedIdle
          .slice(0, currentCount - MAX_RELAY_CONNECTIONS)
          .map((r) => r.url)
        pool.close(urlsToClose)

        if (urlsToClose.length > 0) {
          console.log(`Closed ${urlsToClose.length} connected idle relays`)
        }
      }

      // Warn if we're getting close to browser limits
      // Browser limit ~200-255
      if (relays.length > 150) {
        console.warn(`High relay count: ${relays.length} relays in pool`)
      }
    }, 10_000)

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
