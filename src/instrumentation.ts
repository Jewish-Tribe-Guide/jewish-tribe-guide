import * as Sentry from '@sentry/nextjs'

// No-op until SENTRY_DSN is set (see .env.example) — Sentry's SDK treats a
// missing dsn as "disabled", so this is safe to ship before the account exists.
export function register() {
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
