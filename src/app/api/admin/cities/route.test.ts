import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getAdminUser: vi.fn(), suggestCities: vi.fn(), findCity: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUser: m.getAdminUser, getAllowedAdminEmails: () => ['super@x.co'] }))
vi.mock('@/lib/googleCities', () => ({ suggestCities: m.suggestCities, findCity: m.findCity }))

const { GET } = await import('./route')
const get = (query: string) => GET(new Request(`http://x/api/admin/cities?${query}`) as never, undefined as never)

beforeEach(() => {
  vi.resetAllMocks()
  m.getAdminUser.mockResolvedValue({ email: 'super@x.co' })
})

// New community's "Which city?" (Nov 25, board 1).
describe('GET /api/admin/cities', () => {
  it('suggests Google’s cities for what’s typed', async () => {
    m.suggestCities.mockResolvedValue([{ placeId: 'p1', city: 'Baltimore', area: 'MD, USA' }])
    const res = await get('q=Balti')
    expect(await res.json()).toEqual({ ok: true, cities: [{ placeId: 'p1', city: 'Baltimore', area: 'MD, USA' }] })
    expect(m.suggestCities).toHaveBeenCalledWith('Balti')
  })

  it('gives the one picked with its time zone, from where it is', async () => {
    m.findCity.mockResolvedValue({ city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61 })
    const res = await get('placeId=p1')
    expect(await res.json()).toEqual({ ok: true, city: { city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61, timezone: 'America/New_York' } })
    m.findCity.mockResolvedValue({ city: 'Los Angeles', area: 'California', lat: 34.05, lng: -118.24 })
    expect((await (await get('placeId=p2')).json()).city.timezone).toBe('America/Los_Angeles')
  })

  it('says Google isn’t answering, rather than no cities', async () => {
    m.suggestCities.mockResolvedValue(null)
    const res = await get('q=Balti')
    expect(res.status).toBe(502)
    expect((await res.json()).errors).toEqual(['Google isn’t answering. Try again.'])
    m.findCity.mockResolvedValue(null)
    expect((await get('placeId=p1')).status).toBe(502)
  })

  it('is the site owner’s only', async () => {
    m.getAdminUser.mockResolvedValue(null)
    expect((await get('q=Balti')).status).toBe(401)
    expect(m.suggestCities).not.toHaveBeenCalled()
  })
})
