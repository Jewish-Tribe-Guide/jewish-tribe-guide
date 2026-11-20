import { afterEach, describe, expect, it, vi } from 'vitest'

// The live site with no Upstash (Nov 20, the health sweep). rateLimit.ts
// decides whether it has Upstash at import, so each test imports it fresh.
const report = vi.hoisted(() => vi.fn())
vi.mock('@/lib/serverError', () => ({ reportServerError: report }))

async function fresh() {
  vi.resetModules()
  return import('./rateLimit')
}

function req(ip: string): Request {
  return new Request('https://example.com', { headers: { 'x-forwarded-for': ip } })
}

afterEach(() => {
  vi.unstubAllEnvs()
  report.mockClear()
})

describe('limits on the live site without Upstash', () => {
  it('a ceiling for everyone together refuses, and says why once', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sharedLimit } = await fresh()
    expect((await sharedLimit('ceiling', { limit: 1000, windowSec: 60 })).ok).toBe(false)
    expect((await sharedLimit('ceiling', { limit: 1000, windowSec: 60 })).ok).toBe(false)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toContain('UPSTASH')
  })

  it('a per-visitor limit still counts in memory, and is reported', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    const { rateLimit } = await fresh()
    expect((await rateLimit(req('1.1.1.1'), 'v', { limit: 1, windowSec: 60 })).ok).toBe(true)
    expect((await rateLimit(req('1.1.1.1'), 'v', { limit: 1, windowSec: 60 })).ok).toBe(false)
    expect(report).toHaveBeenCalledTimes(1)
  })

  it('anywhere else counts in memory and reports nothing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sharedLimit } = await fresh()
    expect((await sharedLimit('ceiling', { limit: 1, windowSec: 60 })).ok).toBe(true)
    expect((await sharedLimit('ceiling', { limit: 1, windowSec: 60 })).ok).toBe(false)
    expect(report).not.toHaveBeenCalled()
  })
})

describe('the photo readers’ day', () => {
  it('lets PHOTO_READS_A_DAY through, all readers together, then answers as reading off', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    const { photoReaderSpend, PHOTO_READS_A_DAY } = await fresh()
    for (let i = 0; i < PHOTO_READS_A_DAY; i++) expect(await photoReaderSpend()).toBeNull()
    const res = await photoReaderSpend()
    expect(res?.status).toBe(503)
    expect(await res?.json()).toMatchObject({ ok: false, code: 'off' })
  })
})
