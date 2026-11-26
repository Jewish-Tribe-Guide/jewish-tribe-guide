import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUser: vi.fn(),
  createCommunity: vi.fn(),
  removeUnfinishedCommunity: vi.fn(),
  copyStarterPack: vi.fn(),
  addMissingSiteScreens: vi.fn(),
  reportServerError: vi.fn(),
  listCommunities: vi.fn(),
  readCommunities: vi.fn(),
  listCommunityAdminEmails: vi.fn(),
  listCommunityNotifyPreferenceLists: vi.fn(),
  listCommunityPreviewTokens: vi.fn(),
  listCommunityPlaceCounts: vi.fn(),
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUser: m.getAdminUser, getAllowedAdminEmails: () => ['super@x.co'] }))
vi.mock('@/lib/serverError', () => ({ reportServerError: m.reportServerError }))
vi.mock('@/lib/communityStore', () => ({
  createCommunity: m.createCommunity,
  removeUnfinishedCommunity: m.removeUnfinishedCommunity,
  listCommunities: m.listCommunities,
  readCommunities: m.readCommunities,
  listCommunityAdminEmails: m.listCommunityAdminEmails,
  listCommunityNotifyPreferenceLists: m.listCommunityNotifyPreferenceLists,
  listCommunityPreviewTokens: m.listCommunityPreviewTokens,
  listCommunityPlaceCounts: m.listCommunityPlaceCounts,
}))
vi.mock('@/lib/communityCloning', () => ({ addMissingSiteScreens: m.addMissingSiteScreens }))
vi.mock('@/lib/starterPack', () => ({ copyStarterPack: m.copyStarterPack }))

const { GET, POST } = await import('./route')
const body = { slug: 'baltimore', name: 'Baltimore Jewish Guide', city: { city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61 } }
const post = (over: object = {}) => POST(new Request('http://x/api/admin/communities', { method: 'POST', body: JSON.stringify({ ...body, ...over }) }) as never, undefined as never)

beforeEach(() => {
  vi.resetAllMocks()
  m.getAdminUser.mockResolvedValue({ email: 'super@x.co' })
  m.createCommunity.mockResolvedValue({ slug: 'baltimore' })
})

// Nov 21, the save survey: a community whose content was copied in part
// stayed, and making it again was "already in use".
describe('POST /api/admin/communities: one made only in part', () => {
  it('makes it, copies the content, and adds the screens', async () => {
    expect((await post({ starterPack: true })).status).toBe(200)
    expect(m.copyStarterPack).toHaveBeenCalledWith(expect.objectContaining({ slug: 'baltimore', region: 'Baltimore' }))
    expect(m.addMissingSiteScreens).toHaveBeenCalledWith('baltimore')
    expect(m.removeUnfinishedCommunity).not.toHaveBeenCalled()
  })

  it('a copy that fails takes the new community back out', async () => {
    m.copyStarterPack.mockRejectedValue(new Error('timeout'))
    expect((await post({ starterPack: true })).status).toBe(502)
    expect(m.removeUnfinishedCommunity).toHaveBeenCalledWith('baltimore')
  })

  it('screens that fail take it back out too', async () => {
    m.addMissingSiteScreens.mockRejectedValue(new Error('timeout'))
    expect((await post()).status).toBe(502)
    expect(m.removeUnfinishedCommunity).toHaveBeenCalledWith('baltimore')
  })

  it('a take-back that fails too is said', async () => {
    m.addMissingSiteScreens.mockRejectedValue(new Error('timeout'))
    m.removeUnfinishedCommunity.mockRejectedValue(new Error('also down'))
    const res = await post()
    expect(res.status).toBe(502)
    expect(m.reportServerError).toHaveBeenCalledWith(expect.stringContaining('made only in part'), expect.any(Error))
  })
})

// Nov 25, board 2f: the city, a name and who runs it are all New community
// asks; the rest follows from the city.
describe('POST /api/admin/communities: what follows from the city', () => {
  it('takes the region, time zone and map from the city, and the site\u2019s own colours', async () => {
    expect((await post()).status).toBe(200)
    expect(m.createCommunity).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'baltimore',
        name: 'Baltimore Jewish Guide',
        region: 'Baltimore',
        timezone: 'America/New_York',
        mapCenter: { lat: 39.29, lng: -76.61 },
        themeColor: '#1d4ed8',
        backgroundColor: '#f8fafc',
        mission: expect.stringContaining('Jewish Baltimore'),
        adminEmails: ['super@x.co'],
      }),
    )
  })

  it('starts empty with the switch off', async () => {
    expect((await post({ starterPack: false })).status).toBe(200)
    expect(m.copyStarterPack).not.toHaveBeenCalled()
    expect(m.addMissingSiteScreens).toHaveBeenCalledWith('baltimore')
  })

  it('refuses a city typed and never picked', async () => {
    const res = await post({ city: { city: 'Baltimore' } })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ errors: ['Pick the city from the list.'] })
    expect(m.createCommunity).not.toHaveBeenCalled()
  })

  it('refuses a missing name or address', async () => {
    expect((await post({ name: ' ' })).status).toBe(400)
    expect((await post({ slug: '' })).status).toBe(400)
    expect(m.createCommunity).not.toHaveBeenCalled()
  })
})

// Nov 25: Create lands on this list, which must show the one just made. The
// cached list is stale-while-revalidate, so its first read after the save
// can be the old one.
describe('GET /api/admin/communities', () => {
  it('reads the communities now, never the cached list', async () => {
    m.readCommunities.mockResolvedValue([{ slug: 'philly' }, { slug: 'baltimore' }])
    m.listCommunities.mockResolvedValue([{ slug: 'philly' }])
    m.listCommunityAdminEmails.mockResolvedValue({ baltimore: ['a@x.co'] })
    m.listCommunityNotifyPreferenceLists.mockResolvedValue({})
    m.listCommunityPreviewTokens.mockResolvedValue({})
    m.listCommunityPlaceCounts.mockResolvedValue({ philly: 150 })
    const res = await GET(new Request('http://x/api/admin/communities') as never, undefined as never)
    const { communities } = await res.json()
    expect(communities.map((c: { slug: string }) => c.slug)).toEqual(['philly', 'baltimore'])
    expect(communities[1]).toMatchObject({ adminEmails: ['a@x.co'], placeCount: 0 })
    expect(m.listCommunities).not.toHaveBeenCalled()
  })
})
