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
      {/* A plain link, not next/link: with no signal only a whole-page
          load is answered by the service worker, which opens "/" as the
          community home saved last (sw.js); a router move would ask for
          data nothing has saved. Without it, an installed app opened with
          no signal was stuck here (Nov 18, review item 36). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose, see above */}
      <a
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white"
      >
        Go to the home page
      </a>
    </main>
  )
}
