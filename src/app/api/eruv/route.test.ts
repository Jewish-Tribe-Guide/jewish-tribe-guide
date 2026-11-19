import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ listEruvim: vi.fn(), refreshStale: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: () => 'philly',
  resolveCommunity: async () => ({ slug: 'philly', timezone: 'America/New_York', mapCenter: { lat: 39.95, lng: -75.16 } }),
}))
vi.mock('@/lib/eruvStore', () => ({ listEruvim: m.listEruvim, eruvMapsVersion: async () => 'v1', saveStatusRead: vi.fn() }))
vi.mock('@/lib/eruvReader', () => ({ candlesToday: async () => null, refreshStale: m.refreshStale }))

const { GET } = await import('./route')

const eruv = {
  id: 'cc', name: 'Center City', statusUrl: 'https://eruv.example', status: 'up',
  statusCheckedAt: '2026-11-18T10:00:00Z', statusErrorAt: '2026-11-18T12:00:00Z',
  statusError: 'fetch failed: 403 from https://eruv.example/admin', statusEmailed: false,
}

beforeEach(() => {
  m.listEruvim.mockResolvedValue({ available: true, eruvim: [eruv] })
  m.refreshStale.mockResolvedValue([eruv])
})

describe('GET /api/eruv', () => {
  // Nov 18 review, item 31: the read's error message went to every visitor.
  it('says a read failed and when, never why', async () => {
    const body = await (await GET(new Request('http://x/api/eruv'))).json()
    expect(body.eruvim[0]).toMatchObject({ id: 'cc', statusErrorAt: '2026-11-18T12:00:00Z', statusEmailed: false })
    expect(body.eruvim[0]).not.toHaveProperty('statusError')
  })
})
