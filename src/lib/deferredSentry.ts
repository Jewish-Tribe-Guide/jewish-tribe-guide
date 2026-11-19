// ─────────────────────────────────────────────────────────────────────────────
// Starts Sentry once the page has loaded, instead of at the top of the client
// bundle, the way deferredPostHog.ts does for PostHog.
//
// Sentry's browser SDK was ~74 KB gzipped of every page's first download
// (review item 40, Nov 18), on every visit, for a tool that only matters when
// something breaks. It is now its own chunk, fetched after `load`.
//
// What that costs, and how it's covered:
//  - An error thrown before the SDK arrives would be lost. Uncaught errors and
//    rejections are kept from the start and sent once it has.
//  - Errors React catches (the error boundaries) go through reportError,
//    which waits for the SDK rather than calling a module that isn't there.
//  - The page-load trace starts at init rather than at the first byte, so
//    its timings are shorter than the real load. Navigations are traced as
//    before (sentryRouterTransition).
//
// Nothing here may import '@sentry/nextjs' as a value: that would pull the SDK
// straight back into the first download. Type imports are erased.
// `src/test/sentryOutOfFirstDownload.test.ts` checks the client files.
// ─────────────────────────────────────────────────────────────────────────────

import type * as SentryModule from '@sentry/nextjs'

type Sentry = typeof SentryModule

export type DeferredSentryOptions = {
  /** The live-production gate (see instrumentation-client.ts). */
  enabled: boolean
  dsn: string | undefined
  /** `() => import('@sentry/nextjs')`, passed in so this module never
   *  references the SDK itself. */
  load: () => Promise<Sentry>
}

/** On globalThis rather than in module scope, so the error boundaries' copy
 *  of this module and instrumentation-client's can't disagree about it. */
type State = { sdk: Promise<Sentry | null> | null; current: Sentry | null }
const KEY = '__jpcDeferredSentry'
function state(): State {
  const g = globalThis as unknown as Record<string, State | undefined>
  return (g[KEY] ??= { sdk: null, current: null })
}

/** Returns whether a start was scheduled (false = gated off). */
export function startSentryAfterLoad(opts: DeferredSentryOptions): boolean {
  const { enabled, dsn, load } = opts
  if (!enabled || typeof window === 'undefined') return false
  const s = state()
  if (s.sdk) return true

  const early: unknown[] = []
  const keepError = (e: ErrorEvent) => early.push(e.error ?? e.message)
  const keepRejection = (e: PromiseRejectionEvent) => early.push(e.reason)
  window.addEventListener('error', keepError)
  window.addEventListener('unhandledrejection', keepRejection)

  s.sdk = new Promise<void>((loaded) => {
    if (document.readyState === 'complete') loaded()
    else window.addEventListener('load', () => loaded(), { once: true })
  })
    .then(load)
    .then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        // Session replay isn't worth the bundle weight for this app's traffic; leave off.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      })
      window.removeEventListener('error', keepError)
      window.removeEventListener('unhandledrejection', keepRejection)
      for (const error of early.splice(0)) Sentry.captureException(error)
      s.current = Sentry
      return Sentry
    })
    .catch(() => {
      // Error reporting failing to load must never surface to the visitor.
      window.removeEventListener('error', keepError)
      window.removeEventListener('unhandledrejection', keepRejection)
      return null
    })
  return true
}

/** Sends an error React caught. A no-op wherever Sentry is gated off. */
export function reportError(error: unknown): void {
  void state().sdk?.then((Sentry) => Sentry?.captureException(error))
}

/** Traces a navigation, once the SDK is there; Next calls this before the
 *  router moves (instrumentation-client's onRouterTransitionStart). */
export function sentryRouterTransition(href: string, navigationType: 'push' | 'replace' | 'traverse'): void {
  state().current?.captureRouterTransitionStart(href, navigationType)
}

/** For tests: forget a started SDK. */
export function resetDeferredSentry(): void {
  const g = globalThis as unknown as Record<string, State | undefined>
  delete g[KEY]
}
