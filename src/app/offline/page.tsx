import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline',
  // Nothing here is worth indexing, and it would be a confusing search result.
  robots: { index: false, follow: false },
}

// Served by the service worker when a page is requested with no connection and
// nothing cached for it. Deliberately plain: no data fetching, no images, no
// client JavaScript — it has to render from the cache alone.
//
// The wording matters more than usual. Someone reading this is probably
// standing in a hospital corridor with one bar, so it says which pages still
// work rather than just announcing failure.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">You’re offline</h1>
      <p className="mt-3 text-sm text-muted">
        This page hasn’t been opened on this device yet, so there’s no saved copy to show.
      </p>
      <p className="mt-3 text-sm text-muted">
        Pages you’ve already visited still work without a signal — try going back. Hospital
        basements and lifts are the usual culprits; a floor up or near a window is often enough.
      </p>
    </main>
  )
}
