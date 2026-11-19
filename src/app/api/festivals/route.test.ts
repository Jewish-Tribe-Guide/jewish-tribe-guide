import { beforeEach, describe, expect, it, vi } from 'vitest'

// The festivals' days, on the requested community's calendar (Nov 18 review,
// item 33): they were the deployment config's, whichever community asked.
const m = vi.hoisted(() => ({ fetchFestivals: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/festivals', () => ({ fetchFestivals: m.fetchFestivals }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: async (slug: string | null) => (slug === 'yerushalayim' ? { slug, timezone: 'Asia/Jerusalem' } : { slug: 'philly', timezone: 'America/New_York' }),
}))

const { GET } = await import('./route')

beforeEach(() => {
  m.fetchFestivals.mockReset()
  m.fetchFestivals.mockResolvedValue([])
})

describe('GET /api/festivals', () => {
  it('reads the calendar on the requested community’s clock, else the default community’s', async () => {
    expect((await GET(new Request('http://x/api/festivals?community=yerushalayim'))).status).toBe(200)
    expect(m.fetchFestivals).toHaveBeenLastCalledWith('Asia/Jerusalem')
    await GET(new Request('http://x/api/festivals'))
    expect(m.fetchFestivals).toHaveBeenLastCalledWith('America/New_York')
  })

  it('a failed calendar is a 502, never kept by the CDN', async () => {
    m.fetchFestivals.mockRejectedValue(new Error('hebcal down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(new Request('http://x/api/festivals'))
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBeNull()
  })
})
