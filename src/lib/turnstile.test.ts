import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { turnstileEnabled, verifyTurnstile } from './turnstile'

// The failure policy here is deliberately asymmetric — see the file's own
// comment — so these tests pin both halves: a bad/missing token blocks, but
// Cloudflare being unreachable never blocks a real submission over it.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('turnstileEnabled', () => {
  it('is false when the secret is unset', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(turnstileEnabled()).toBe(false)
  })

  it('is true once the secret is set', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret')
    expect(turnstileEnabled()).toBe(true)
  })
})

describe('verifyTurnstile', () => {
  it('allows through when Turnstile is not configured, even with no token', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(await verifyTurnstile(undefined)).toBe(true)
  })

  it('blocks a missing token once Turnstile is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await verifyTurnstile(undefined)).toBe(false)
    // Never even asks Cloudflare — there's nothing to verify.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  describe('with a secret configured', () => {
    beforeEach(() => vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret'))

    it('allows a token Cloudflare confirms as valid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }),
      )
      expect(await verifyTurnstile('good-token')).toBe(true)
    })

    it('blocks a token Cloudflare rejects', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }),
      )
      expect(await verifyTurnstile('bad-token')).toBe(false)
    })

    it('fails open when Cloudflare can\'t be reached', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      expect(await verifyTurnstile('some-token')).toBe(true)
    })

    it('sends the secret and token to Cloudflare', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) })
      vi.stubGlobal('fetch', fetchSpy)
      await verifyTurnstile('the-token')

      const [url, init] = fetchSpy.mock.calls[0]!
      expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
      const body = init.body as URLSearchParams
      expect(body.get('secret')).toBe('secret')
      expect(body.get('response')).toBe('the-token')
      expect(body.get('remoteip')).toBeNull()
    })

    it('includes remoteip when a real client IP is given', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) })
      vi.stubGlobal('fetch', fetchSpy)
      await verifyTurnstile('the-token', '1.2.3.4')

      const [, init] = fetchSpy.mock.calls[0]!
      expect((init.body as URLSearchParams).get('remoteip')).toBe('1.2.3.4')
    })

    it('omits remoteip for the "unknown" placeholder IP', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) })
      vi.stubGlobal('fetch', fetchSpy)
      await verifyTurnstile('the-token', 'unknown')

      const [, init] = fetchSpy.mock.calls[0]!
      expect((init.body as URLSearchParams).get('remoteip')).toBeNull()
    })
  })
})
