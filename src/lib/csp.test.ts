import { describe, expect, it } from 'vitest'
import { buildCsp, cspReportUri } from './csp'

const ENV = {
  supabaseUrl: 'https://abcdefg.supabase.co',
  posthogHost: 'https://us.posthog.com',
  sentryDsn: 'https://pubkey123@o111.ingest.us.sentry.io/222',
}

/** The value list of one directive, e.g. directive(csp, 'script-src'). */
function directive(csp: string, name: string): string[] {
  const found = csp.split('; ').find((d) => d.startsWith(`${name} `))
  if (!found) throw new Error(`no ${name} in: ${csp}`)
  return found.slice(name.length + 1).split(' ')
}

describe('buildCsp', () => {
  const csp = buildCsp(ENV)

  it('locks down what nothing here needs', () => {
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
    expect(directive(csp, 'form-action')).toEqual(["'self'"])
    expect(directive(csp, 'frame-ancestors')).toEqual(["'self'"])
    expect(directive(csp, 'default-src')).toEqual(["'self'"])
  })

  it('allows the third parties the site actually uses, and only those, for scripts', () => {
    const scripts = directive(csp, 'script-src')
    expect(scripts).toEqual(
      expect.arrayContaining([
        "'self'",
        'https://maps.googleapis.com',
        'https://challenges.cloudflare.com',
        'https://us.posthog.com',
        'https://*.posthog.com',
      ]),
    )
    // The one thing that must never be here: any-origin script.
    expect(scripts).not.toContain('*')
    expect(scripts).not.toContain('https:')
    expect(scripts).not.toContain("'unsafe-eval'")
  })

  it('allows connections to its own backend, geocoding and telemetry, and no others', () => {
    expect(directive(csp, 'connect-src')).toEqual(
      expect.arrayContaining([
        "'self'",
        'https://abcdefg.supabase.co',
        'wss://abcdefg.supabase.co',
        'https://nominatim.openstreetmap.org',
        'https://o111.ingest.us.sentry.io',
      ]),
    )
    expect(directive(csp, 'connect-src')).not.toContain('*')
    expect(directive(csp, 'connect-src')).not.toContain('https:')
  })

  it('frames only Cloudflare (the Turnstile challenge)', () => {
    expect(directive(csp, 'frame-src')).toEqual(['https://challenges.cloudflare.com'])
  })

  it('permits eval and the hot-reload websocket only for `next dev`, never otherwise', () => {
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'")
    expect(directive(csp, 'connect-src').some((v) => v.startsWith('ws://'))).toBe(false)

    const dev = buildCsp({ ...ENV, dev: true })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(dev, 'connect-src')).toContain('ws://localhost:*')
  })

  it('does not report unless asked to', () => {
    expect(csp).not.toContain('report-uri')
    expect(buildCsp({ ...ENV, reportViolations: true })).toContain('report-uri https://o111.ingest.us.sentry.io/api/222/security/?sentry_key=pubkey123')
  })

  it('survives every env var being missing or malformed', () => {
    for (const env of [{}, { supabaseUrl: 'nope', posthogHost: '::', sentryDsn: 'x' }, { reportViolations: true }]) {
      const c = buildCsp(env)
      expect(c).toContain("default-src 'self'")
      expect(c).not.toContain('undefined')
      expect(c).not.toContain('null')
      expect(c).not.toContain('report-uri')
    }
  })

  it('only opens up the PostHog domain when the host is really posthog.com', () => {
    expect(directive(buildCsp({ posthogHost: 'https://ph.internal.example' }), 'script-src')).not.toContain('https://*.posthog.com')
    expect(directive(buildCsp({ posthogHost: 'https://eu.posthog.com' }), 'script-src')).toContain('https://*.posthog.com')
  })

  it('lists no origin twice', () => {
    for (const name of ['script-src', 'connect-src']) {
      const values = directive(buildCsp({ ...ENV, posthogHost: 'https://us.posthog.com' }), name)
      expect(new Set(values).size, name).toBe(values.length)
    }
  })
})

describe('cspReportUri', () => {
  it.each([[undefined], [''], ['not a url'], ['https://ingest.sentry.io/'], ['https://@host/1'], ['https://key@host']])(
    'is null for %s',
    (dsn) => {
      expect(cspReportUri(dsn as string | undefined)).toBeNull()
    },
  )
})
