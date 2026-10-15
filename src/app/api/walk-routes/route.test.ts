import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), walkRoutesFrom: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/walkRouteStore', () => ({ walkRoutesFrom: m.walkRoutesFrom }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: () => 'philly',
  resolveCommunity: async () => ({ slug: 'philly' }),
}))

const { GET } = await import('./route')
const ID = '0b7c6c5e-6a0e-4c1b-9d0e-1f2a3b4c5d6e'

beforeEach(() => {
  m.enforceRateLimit.mockReset().mockResolvedValue(null)
  m.walkRoutesFrom.mockReset()
})

describe('GET /api/walk-routes', () => {
  it('the walks from one listing, shared at the CDN for an hour', async () => {
    const routes = { s1: { from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 }, minutes: 9, meters: 700 } }
    m.walkRoutesFrom.mockResolvedValue(routes)
    const res = await GET(new Request(`http://localhost/api/walk-routes?from=${ID}`))
    expect(await res.json()).toEqual({ ok: true, routes })
    expect(m.walkRoutesFrom).toHaveBeenCalledWith('philly', ID)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=3600')
  })

  it('refuses anything but a listing id, without reading', async () => {
    const res = await GET(new Request('http://localhost/api/walk-routes?from=nope'))
    expect(res.status).toBe(400)
    expect(m.walkRoutesFrom).not.toHaveBeenCalled()
  })

  it('a failed read is a 502 with nothing in it', async () => {
    m.walkRoutesFrom.mockRejectedValue(new Error('down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(new Request(`http://localhost/api/walk-routes?from=${ID}`))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, routes: {} })
    error.mockRestore()
  })
})
