import { beforeEach, describe, expect, it, vi } from 'vitest'

const getZmanimData = vi.hoisted(() => vi.fn())
vi.mock('@/lib/zmanim', () => ({ getZmanimData }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
// Two communities on different clocks: no `tzid` means the requested one's.
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: async (slug: string | null) => (slug === 'yerushalayim' ? { slug, timezone: 'Asia/Jerusalem' } : { slug: 'philly', timezone: 'America/New_York' }),
}))

const { GET } = await import('./route')

const call = (qs: string) => GET(new Request(`http://x/api/zmanim/batch?${qs}`))

beforeEach(() => {
  getZmanimData.mockReset()
})

describe('GET /api/zmanim/batch', () => {
  it('answers every requested spot, each with its own status', async () => {
    getZmanimData.mockImplementation(async ({ latitude }: { latitude: number }) => {
      if (latitude === 40) throw new Error('hebcal down')
      return { spot: latitude }
    })
    const res = await call('p=39.95,-75.16&p=40,-75.2')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage')
    expect(await res.json()).toEqual({
      ok: true,
      results: [
        { lat: 39.95, lng: -75.16, ok: true, data: { spot: 39.95 } },
        { lat: 40, lng: -75.2, ok: false },
      ],
    })
  })

  it('refuses a bad request without touching Hebcal', async () => {
    const res = await call('p=nope')
    expect(res.status).toBe(400)
    expect(getZmanimData).not.toHaveBeenCalled()
  })

  it('is a 502, not a cacheable 200, when every spot fails', async () => {
    getZmanimData.mockRejectedValue(new Error('down'))
    const res = await call('p=39.95,-75.16')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBeNull()
  })

  // Nov 18 review, item 33: the shuls' sunsets for "today" came from the
  // deployment config's clock, whichever community asked.
  it('takes a tzid, and with none answers on the requested community’s clock', async () => {
    getZmanimData.mockResolvedValue({})
    await call('p=31.78,35.22&tzid=Asia/Jerusalem')
    expect(getZmanimData).toHaveBeenLastCalledWith({ latitude: 31.78, longitude: 35.22, timezone: 'Asia/Jerusalem' })
    await call('p=31.78,35.22&community=yerushalayim')
    expect(getZmanimData).toHaveBeenLastCalledWith({ latitude: 31.78, longitude: 35.22, timezone: 'Asia/Jerusalem' })
  })
})
