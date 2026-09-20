// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy.
//
// A CSP tells the browser which origins a page may load scripts, frames, images
// and connections from, so that if something hostile ever does get into the
// page — an unescaped admin-edited string, a compromised dependency — it can't
// freely pull in more code or send what it finds somewhere else.
//
// It ships as Content-Security-Policy-REPORT-ONLY first: the browser evaluates
// the policy and reports what it WOULD have blocked, but blocks nothing. This
// site loads Google Maps, Supabase, Cloudflare Turnstile, PostHog, Sentry and
// Vercel's scripts, and getting the allowlist wrong in enforcing mode breaks the
// map or the forms for everyone. Watch the reports (Sentry, in production),
// fix the list, then switch the header name to enforce — see next.config.ts.
//
// What this does NOT do yet, and why:
//
//  - script-src has 'unsafe-inline'. Next's own inline scripts (the RSC payload,
//    hydration bootstrap) need either that or a per-request nonce, and a nonce
//    means the page can no longer be prerendered and cached — it would give up
//    the Cache Components work this site is built around. So inline script
//    injection is NOT stopped by this policy. What it does stop is loading
//    script from, and sending data to, origins that aren't listed — which is
//    most of what an attacker does next. Hashes are the way to close the rest.
//  - img-src allows any https: image, because listing photos and admin-pasted
//    category images come from arbitrary hosts.
// ─────────────────────────────────────────────────────────────────────────────

export type CspEnv = {
  supabaseUrl?: string
  posthogHost?: string
  sentryDsn?: string
  /** Send violation reports to Sentry. Off unless this is the real production
   *  deployment, the same gate Sentry itself uses — otherwise every local run
   *  and preview deployment would file reports into the production project. */
  reportViolations?: boolean
  /** `next dev`: React's dev build uses eval() and the dev server a websocket for
   *  hot reload, so a report-only policy without these would flood the
   *  developer's console with warnings on every page. Never true in production. */
  dev?: boolean
}

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** Where Sentry wants violation reports, derived from the DSN — its "security"
 *  endpoint. Null for a missing or malformed DSN. */
export function cspReportUri(sentryDsn: string | undefined): string | null {
  if (!sentryDsn) return null
  try {
    const dsn = new URL(sentryDsn)
    const projectId = dsn.pathname.replace(/^\//, '')
    if (!dsn.username || !projectId) return null
    return `${dsn.protocol}//${dsn.host}/api/${projectId}/security/?sentry_key=${dsn.username}`
  } catch {
    return null
  }
}

export function buildCsp(env: CspEnv = {}): string {
  const supabase = originOf(env.supabaseUrl)
  const posthog = originOf(env.posthogHost)
  // posthog-js fetches its session-recording code from a sibling *-assets host
  // of its API host, so allow the whole product domain rather than one origin.
  const posthogDomain = posthog && new URL(posthog).hostname.endsWith('posthog.com') ? 'https://*.posthog.com' : null
  const sentryIngest = originOf(env.sentryDsn)

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))]

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': uniq([
      "'self'",
      "'unsafe-inline'", // see the note above
      env.dev ? "'unsafe-eval'" : null,
      'https://maps.googleapis.com',
      'https://challenges.cloudflare.com',
      posthog,
      posthogDomain,
    ]),
    // Tailwind and next/font emit inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': uniq([
      "'self'",
      supabase,
      // Realtime, if it's ever used, is a websocket to the same host.
      supabase ? supabase.replace(/^https:/, 'wss:') : null,
      'https://maps.googleapis.com',
      'https://nominatim.openstreetmap.org',
      env.dev ? 'ws://localhost:*' : null,
      posthog,
      posthogDomain,
      sentryIngest,
    ]),
    'frame-src': ['https://challenges.cloudflare.com'],
    // posthog-js and Sentry run recorders/compression in blob: workers.
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    // Already enforced by its own header (next.config.ts); repeated here so a
    // report-only evaluation is of the full policy.
    'frame-ancestors': ["'self'"],
  }

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`)
  const report = env.reportViolations ? cspReportUri(env.sentryDsn) : null
  if (report) parts.push(`report-uri ${report}`)
  return parts.join('; ')
}
