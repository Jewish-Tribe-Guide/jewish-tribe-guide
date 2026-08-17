'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// The last resort: an error in the root layout itself, above every other
// boundary. It replaces the whole document, so it has to render its own <html>
// and <body> and can't rely on the app's fonts, CSS variables, or chrome —
// hence the inline styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#0f172a',
          background: '#f8fafc',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Something went wrong on our end
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
            The site failed to load. Trying again often works.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#fff',
              background: '#1d4ed8',
              border: 0,
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              If you report this, mention code {error.digest}.
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
