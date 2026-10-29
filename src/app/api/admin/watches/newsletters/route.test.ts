import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Newsletters page's read: the Gmail script handed out with this
// community's own key in it, so it's for the community's admins alone.
const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  getNewsletterSetup: vi.fn(),
  listWatches: vi.fn(),
  loadListings: vi.fn(),
  listApprovedResources: vi.fn(),
  listCategories: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/newsletterSetupStore', () => ({ getNewsletterSetup: m.getNewsletterSetup }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))
vi.mock('@/lib/listingReads', () => ({ loadListings: m.loadListings }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))

const { GET } = await import('./route')
const req = () => new Request('http://x/api/admin/watches/newsletters?community=riverton')

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://guide.example')
  m.resolveCommunity.mockResolvedValue({ slug: 'riverton' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.getNewsletterSetup.mockResolvedValue({ key: 'nl_riverton', checkedAt: '2026-10-29T19:00:00.000Z', account: 'r@gmail.com' })
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.loadListings.mockResolvedValue({ readsOf: () => null, nameOf: () => null, siteGap: () => null, placePage: () => null })
  m.listApprovedResources.mockResolvedValue([{ id: 's2', name: 'Young Israel', category: 'synagogue' }, { id: 's1', name: 'Beth Israel', category: 'synagogue' }])
  m.listCategories.mockResolvedValue([{ id: 'synagogue', label: 'Synagogues' }])
})

describe('GET /api/admin/watches/newsletters', () => {
  it('is for this community’s admins alone', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(m.getNewsletterSetup).not.toHaveBeenCalled()
  })

  it('hands out the script filled in for this community, with its own key', async () => {
    const res = await GET(req())
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, available: true, checkedAt: '2026-10-29T19:00:00.000Z', account: 'r@gmail.com', newsletters: [] })
    expect(body.script).toMatch(/^var SITE = 'https:\/\/guide\.example'$/m)
    expect(body.script).toMatch(/^var COMMUNITY = 'riverton'$/m)
    expect(body.script).toMatch(/^var KEY = 'nl_riverton'$/m)
    expect(body.places).toEqual([
      { id: 's1', name: 'Beth Israel', categoryLabel: 'Synagogues' },
      { id: 's2', name: 'Young Israel', categoryLabel: 'Synagogues' },
    ])
  })

  it('without migration 090, no script', async () => {
    m.getNewsletterSetup.mockResolvedValue(null)
    expect(await (await GET(req())).json()).toMatchObject({ ok: true, available: false, script: null, checkedAt: null })
  })
})
