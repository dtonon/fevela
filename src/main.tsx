import './i18n'
import './index.css'
import './polyfill'
import './services/lightning.service'

import { createRoot } from 'react-dom/client'
import { initNostrWasm } from 'nostr-wasm/gzipped'
import { setNostrWasm, verifyEvent } from '@nostr/tools/wasm'
import { AbstractSimplePool } from '@nostr/tools/abstract-pool'
import { pool, setPool } from '@nostr/gadgets/global'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)
setVh()

initNostrWasm()
  .then((nw) => {
    setNostrWasm(nw)
    setPool(new AbstractSimplePool({ verifyEvent }))
    pool.trackRelays = true

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
