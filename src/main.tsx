import './i18n'
import './index.css'
import './polyfill'
import './services/lightning.service'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initNostrWasm } from 'nostr-wasm'
import { setNostrWasm, verifyEvent } from '@nostr/tools/wasm'
import { AbstractSimplePool } from '@nostr/tools/abstract-pool'
import { pool, setPool } from '@nostr/gadgets/global'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

window.addEventListener('resize', setVh)
window.addEventListener('orientationchange', setVh)
setVh()

initNostrWasm()
  .then(setNostrWasm)
  .then(() => {
    setPool(new AbstractSimplePool({ verifyEvent }))
    pool.trackRelays = true

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    )
  })

function setVh() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`)
}
