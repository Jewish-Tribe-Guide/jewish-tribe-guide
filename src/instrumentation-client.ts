import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

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

// Set up deliberately (not via PostHog's GitHub-App code wizard — see the
// abandoned posthog/instrumentation-4fc419 branch, never merged, generated
// against a different PostHog account than this project). Session replay is
// the actual reason this exists — everything else PostHog's SDK captures by
// default (pageviews, autocapture) is a side effect, not the goal, so this
// stays intentionally minimal rather than reproducing the wizard's full
// nine-event instrumentation. Same prod-only gate as Sentry above, so local
// dev and the e2e suites don't record real sessions into the live project.
// `disable_session_recording` starts false (recording on) the moment the
// project itself has Session Replay enabled in PostHog's settings — the SDK
// flag alone doesn't turn it on, only whether an already-enabled project
// records this particular visitor.
if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') {
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (projectToken && host) {
    posthog.init(projectToken, { api_host: host, defaults: '2025-05-24' })
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
