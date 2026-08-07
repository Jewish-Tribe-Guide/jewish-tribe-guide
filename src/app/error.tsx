'use client'

import { useEffect } from 'react'

// Catches a render or data error anywhere under the root layout. Without this
// the visitor got Next's bare error screen, which says nothing about what to do
// next and doesn't look like this site at all.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is what ties this to the server-side log entry.
    console.error('[error boundary]', error)
  }, [error])

  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Something went wrong on our end
      </h1>
      <p className="mt-3 text-sm text-muted">
        This is our problem, not yours — the page didn’t load. Trying again often works.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white cursor-pointer"
        >
          Try again
        </button>
        {/* A plain <a>, not next/link, on purpose. This renders when something
            has already gone wrong, and a client-side navigation would keep
            whatever broken state caused it. A full document load is the more
            reliable escape hatch, which is the whole job of this button —
            `reset()` above is the soft option, and this is the one that works
            when the soft option doesn't. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Go home
        </a>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-slate-400">
          If you report this, mention code <code className="font-mono">{error.digest}</code>.
        </p>
      )}
    </main>
  )
}
