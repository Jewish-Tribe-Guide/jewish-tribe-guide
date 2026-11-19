import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  getCommunityDefaultLocation: vi.fn(),
  setCommunityDefaultLocation: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
  getCommunityDefaultLocation: m.getCommunityDefaultLocation,
  setCommunityDefaultLocation: m.setCommunityDefaultLocation,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { GET, PUT } = await import('./route')
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/default-location?community=pgh', {
    method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
const squirrelHill = { lat: 40.4383, lng: -79.9227, label: 'Squirrel Hill, Pittsburgh, PA' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'pgh' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.setCommunityDefaultLocation.mockResolvedValue({ center: { lat: 40.4383, lng: -79.9227 }, label: squirrelHill.label, timezone: 'America/New_York' })
})

describe.each([
  ['GET', () => GET(req('GET'))],
  ['PUT', () => PUT(req('PUT', squirrelHill))],
])('%s /api/admin/default-location', (_m, call) => {
  it('401s without an admin of this community, changing nothing', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.getAdminUserForCommunity).toHaveBeenCalledWith(expect.any(Request), 'pgh')
    expect(m.setCommunityDefaultLocation).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/default-location', () => {
  it('saves the picked place for this community and refreshes the site', async () => {
    const res = await PUT(req('PUT', squirrelHill))
    expect(res.status).toBe(200)
    expect(m.setCommunityDefaultLocation).toHaveBeenCalledWith('pgh', squirrelHill)
    expect(m.revalidatePublicContent).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ ok: true, label: squirrelHill.label, timezone: 'America/New_York' })
  })

  it.each([
    ['no coordinates', { label: 'Squirrel Hill' }],
    ['text for a number', { lat: '40.4', lng: -79.9, label: 'x' }],
    ['no label', { lat: 40.4, lng: -79.9 }],
  ])('400s %s and saves nothing', async (_n, body) => {
    expect((await PUT(req('PUT', body))).status).toBe(400)
    expect(m.setCommunityDefaultLocation).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('says what was wrong with the place, without refreshing', async () => {
    m.setCommunityDefaultLocation.mockRejectedValue(new RangeError('That place has no usable location.'))
    const res = await PUT(req('PUT', { ...squirrelHill, lat: 400 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ errors: ['That place has no usable location.'] })
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/default-location', () => {
  it('reads what is stored now', async () => {
    m.getCommunityDefaultLocation.mockResolvedValue({ center: { lat: 40.44, lng: -79.99 }, label: null, region: 'Pittsburgh', timezone: 'America/New_York' })
    const res = await GET(req('GET'))
    expect(await res.json()).toEqual({ ok: true, center: { lat: 40.44, lng: -79.99 }, label: null, region: 'Pittsburgh', timezone: 'America/New_York' })
  })
})
