// ─────────────────────────────────────────────────────────────────────────────
// Starts PostHog (session replay) after the page has finished loading and the
// browser has gone idle, instead of at the top of the client bundle.
//
// Measured on the home page: posthog-js is ~90 KB gzipped of the ~427 KB of
// JavaScript every visit downloaded, parsed and ran before the page was usable
// — for a tool whose only job here is session replay, which nothing on the page
// waits for. A dynamic import moves it out of the initial bundle into its own
// chunk, fetched once the visitor already has a working page.
//
// The cost is that recording starts a moment after load rather than at the
// first byte, so the first second or two of a visit isn't replayed.
// ─────────────────────────────────────────────────────────────────────────────

type PostHogModule = { default: { init: (token: string, options: Record<string, unknown>) => unknown } }

export type DeferredPostHogOptions = {
  /** The live-production gate (see instrumentation-client.ts). */
  enabled: boolean
  token: string | undefined
  host: string | undefined
  /** `() => import('posthog-js')` — passed in so this module never references
   *  posthog-js itself and can't pull it back into the initial bundle. */
  load: () => Promise<PostHogModule>
  /** How long to wait for an idle moment before starting anyway. */
  idleTimeoutMs?: number
}

/** Runs `fn` once the window has loaded, then when the browser is idle.
 *  Safari has no requestIdleCallback, so it falls back to a short timer. */
function whenLoadedAndIdle(fn: () => void, idleTimeoutMs: number) {
  const idle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: idleTimeoutMs })
    else setTimeout(fn, 2000)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

/** Returns whether a start was scheduled (false = gated off or unconfigured). */
export function startPostHogWhenIdle(opts: DeferredPostHogOptions): boolean {
  const { enabled, token, host, load, idleTimeoutMs = 5000 } = opts
  if (!enabled || !token || !host || typeof window === 'undefined') return false

  whenLoadedAndIdle(() => {
    load()
      .then((m) => m.default.init(token, { api_host: host, defaults: '2025-05-24' }))
      .catch(() => {
        // Analytics failing to load must never surface to the visitor.
      })
  }, idleTimeoutMs)
  return true
}
