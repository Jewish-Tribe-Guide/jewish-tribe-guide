import * as Sentry from '@sentry/nextjs'

// Same no-op-until-configured behavior as src/instrumentation.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session replay isn't worth the bundle weight for this app's traffic; leave off.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
