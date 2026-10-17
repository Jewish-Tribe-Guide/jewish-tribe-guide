import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGetZmanimData = vi.hoisted(() => vi.fn())
vi.mock('@/lib/zmanim', () => ({ getZmanimData: mockGetZmanimData }))
const mockEnforce = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: mockEnforce }))

const { GET } = await import('./route')
const get = (q: string) => GET(new Request(`http://localhost/api/zmanim?${q}`))

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/zmanim', () => {
  it('returns 429 without calling Hebcal when rate limited', async () => {
    mockEnforce.mockResolvedValue(new Response('slow down', { status: 429 }))
    const res = await get('lat=1&lng=2')
    expect(res.status).toBe(429)
    expect(mockGetZmanimData).not.toHaveBeenCalled()
  })

  it('rejects invalid input with 400 before any upstream call', async () => {
    mockEnforce.mockResolvedValue(null)
    for (const q of ['lat=999&lng=2', 'lat=1&lng=2&tzid=Nope/Nope', 'lat=1']) {
      expect((await get(q)).status).toBe(400)
    }
    expect(mockGetZmanimData).not.toHaveBeenCalled()
  })

  it('passes rounded coordinates upstream and marks the response CDN-cacheable', async () => {
    mockEnforce.mockResolvedValue(null)
    mockGetZmanimData.mockResolvedValue({ hebrewDate: 'x' })
    const res = await get('lat=39.95234&lng=-75.16379&tzid=America/New_York')

    expect(mockGetZmanimData).toHaveBeenCalledWith({
      latitude: 39.95,
      longitude: -75.16,
      timezone: 'America/New_York',
    })
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=')
    expect(await res.json()).toEqual({ ok: true, data: { hebrewDate: 'x' } })
  })

  it('does not let a CDN cache an upstream failure', async () => {
    mockEnforce.mockResolvedValue(null)
    mockGetZmanimData.mockRejectedValue(new Error('hebcal down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await get('lat=1&lng=2')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBeNull()
  })
})
