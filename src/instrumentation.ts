import * as Sentry from '@sentry/nextjs'

// No-op until SENTRY_DSN is set (see .env.example) — Sentry's SDK treats a
// missing dsn as "disabled", so this is safe to ship before the account exists.
// Also gated on actually being the live Vercel production deployment (see
// src/instrumentation-client.ts's matching comment) — SENTRY_DSN lives in
// .env.local too, so without this every local dev session and every local
// production-mode run (`npm run build && npm run start`, the e2e suites)
// reported real events into the same project as production traffic.
export function register() {
  if (process.env.VERCEL_ENV !== 'production') return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    })
  }
}

export const onRequestError = Sentry.captureRequestError
