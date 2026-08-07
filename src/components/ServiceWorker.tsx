'use client'

import { useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Registers the offline service worker (public/sw.js).
//
// Production only, deliberately. In development the dev server rewrites assets
// constantly and a cache sitting in front of that produces stale-bundle bugs
// that look like application bugs — hours get lost to it. Verify offline
// behaviour against a production build instead (`npm run build && npm start`).
//
// It also actively unregisters itself in development, so a worker installed
// while testing a production build can't linger and poison the dev server on
// the same origin — which is exactly the trap this note exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
      return
    }

    // After load, so registration never competes with the page's own requests
    // for bandwidth on the first visit — which on a weak connection is the
    // visit that matters most.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // A failed registration costs offline support, nothing else. The app
        // works exactly as it did before.
        console.error('[sw] registration failed:', err)
      })
    }

    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
