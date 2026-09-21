import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), compute: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/travelTime', () => ({ computeTravelTimesFrom: m.compute }))

const { POST } = await import('./route')
const { LIMITS } = await import('@/lib/limits')
const post = (body: unknown) =>
  POST(new Request('http://x/api/travel', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never)

const origin = { lat: 39.95, lng: -75.16 }
const dest = (i: number) => ({ id: `d${i}`, lat: 40, lng: -75 })

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.compute.mockResolvedValue({ d1: { drive: 5, walk: 20 } })
})

describe('POST /api/travel', () => {
  it('returns the rate limiter’s response without a Google lookup', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post({ origin, destinations: [dest(1)] })).status).toBe(429)
    expect(m.compute).not.toHaveBeenCalled()
  })

  it.each([
    ['no origin', { destinations: [] }],
    ['a string latitude', { origin: { lat: '39', lng: -75 }, destinations: [] }],
    ['a string longitude', { origin: { lat: 39, lng: '-75' }, destinations: [] }],
    ['a missing longitude', { origin: { lat: 39 }, destinations: [] }],
    ['no destinations array', { origin }],
    ['destinations that is not an array', { origin, destinations: 'x' }],
  ])('400s %s', async (_n, body) => {
    expect((await post(body)).status).toBe(400)
    expect(m.compute).not.toHaveBeenCalled()
  })

  it('500s (generic) on a body that is not JSON', async () => {
    expect((await post('{')).status).toBe(500)
  })

  it('accepts exactly the cap and 413s one over it — each destination is a paid lookup', async () => {
    const at = Array.from({ length: LIMITS.travelDestinations }, (_, i) => dest(i))
    expect((await post({ origin, destinations: at })).status).toBe(200)
    m.compute.mockClear()
    expect((await post({ origin, destinations: [...at, dest(9999)] })).status).toBe(413)
    expect(m.compute).not.toHaveBeenCalled()
  })

  it('returns the computed results', async () => {
    const res = await post({ origin, destinations: [dest(1)] })
    expect(await res.json()).toEqual({ ok: true, results: { d1: { drive: 5, walk: 20 } } })
    expect(m.compute).toHaveBeenCalledWith(origin, [dest(1)])
  })

  it('500s with a generic message when the lookup throws', async () => {
    m.compute.mockRejectedValue(new Error('GOOGLE_KEY=secret'))
    const res = await post({ origin, destinations: [dest(1)] })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'Internal error' })
  })
})
