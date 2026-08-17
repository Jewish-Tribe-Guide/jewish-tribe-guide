import { describe, expect, it, vi } from 'vitest'
import { clientIp, enforceRateLimit, rateLimit } from './rateLimit'

// Runs entirely against the in-memory fallback: UPSTASH_REDIS_REST_URL/TOKEN
// are unset in this environment, so `redis` in rateLimit.ts is null for the
// whole file (decided once, at import time) and every call below exercises
// the same fixed-window logic Vercel actually falls back to whenever Upstash
// isn't configured — not a mock of it.

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers })
}

describe('clientIp', () => {
  it('reads the first hop of x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('trims whitespace around the first hop', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  // Fails safe toward limiting (a shared bucket) rather than wide open —
  // every IP-less request piles into the same 'unknown' key instead of each
  // getting its own fresh limit.
  it('falls back to a constant when neither header is present', () => {
    expect(clientIp(req())).toBe('unknown')
  })
})

describe('rateLimit (in-memory fallback)', () => {
  it('allows requests up to the limit, then blocks', async () => {
    const name = `test-${Math.random()}`
    const opts = { limit: 3, windowSec: 60 }
    const r = req({ 'x-forwarded-for': '10.0.0.1' })

    expect((await rateLimit(r, name, opts)).ok).toBe(true)
    expect((await rateLimit(r, name, opts)).ok).toBe(true)
    expect((await rateLimit(r, name, opts)).ok).toBe(true)
    const blocked = await rateLimit(r, name, opts)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('gives each name its own bucket for the same IP', async () => {
    const opts = { limit: 1, windowSec: 60 }
    const r = req({ 'x-forwarded-for': '10.0.0.2' })
    const nameA = `bucket-a-${Math.random()}`
    const nameB = `bucket-b-${Math.random()}`

    expect((await rateLimit(r, nameA, opts)).ok).toBe(true)
    // Would be blocked if nameA and nameB shared a counter.
    expect((await rateLimit(r, nameB, opts)).ok).toBe(true)
  })

  it('gives each IP its own bucket for the same name', async () => {
    const opts = { limit: 1, windowSec: 60 }
    const name = `shared-name-${Math.random()}`

    expect((await rateLimit(req({ 'x-forwarded-for': '10.0.0.3' }), name, opts)).ok).toBe(true)
    expect((await rateLimit(req({ 'x-forwarded-for': '10.0.0.4' }), name, opts)).ok).toBe(true)
  })

  it('resets once the window has elapsed', async () => {
    vi.useFakeTimers()
    try {
      const name = `window-${Math.random()}`
      const opts = { limit: 1, windowSec: 60 }
      const r = req({ 'x-forwarded-for': '10.0.0.5' })

      expect((await rateLimit(r, name, opts)).ok).toBe(true)
      expect((await rateLimit(r, name, opts)).ok).toBe(false)

      vi.advanceTimersByTime(60_001)

      expect((await rateLimit(r, name, opts)).ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('enforceRateLimit', () => {
  it('returns null when the request is within the limit', async () => {
    const name = `enforce-ok-${Math.random()}`
    const result = await enforceRateLimit(req({ 'x-forwarded-for': '10.0.0.6' }), name, {
      limit: 5,
      windowSec: 60,
    })
    expect(result).toBeNull()
  })

  it('returns a 429 with a Retry-After header once blocked', async () => {
    const name = `enforce-block-${Math.random()}`
    const opts = { limit: 1, windowSec: 60 }
    const r = req({ 'x-forwarded-for': '10.0.0.7' })

    expect(await enforceRateLimit(r, name, opts)).toBeNull()
    const blocked = await enforceRateLimit(r, name, opts)

    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeTruthy()
    const body = await blocked!.json()
    expect(body.ok).toBe(false)
    expect(body.errors[0]).toMatch(/too many requests/i)
  })
})
