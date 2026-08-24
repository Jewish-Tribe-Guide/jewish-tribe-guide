import * as Sentry from '@sentry/nextjs'

// Same no-op-until-configured behavior as src/instrumentation.ts. Also gated
// on actually being the live Vercel production deployment — NEXT_PUBLIC_SENTRY_DSN
// lives in .env.local too (so `npm run dev` can exercise this code path),
// which without this check meant every contributor's local dev session, and
// every local production-mode run (`npm run build && npm run start`, the e2e
// suites), reported real events into the same project as production traffic.
// NEXT_PUBLIC_VERCEL_ENV is the client-safe form Vercel auto-injects — plain
// VERCEL_ENV isn't NEXT_PUBLIC_-prefixed, so it wouldn't survive into this
// bundle.
if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Session replay isn't worth the bundle weight for this app's traffic; leave off.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
