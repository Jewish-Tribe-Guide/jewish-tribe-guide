import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  getCommunityEmail: vi.fn(),
  saveCommunityEmail: vi.fn(),
  listWatches: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/communityEmailStore', async (real) => ({
  ...(await real<typeof import('@/lib/communityEmailStore')>()),
  getCommunityEmail: m.getCommunityEmail,
  saveCommunityEmail: m.saveCommunityEmail,
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))

const { GET, POST } = await import('./route')
const url = 'http://x/api/admin/community-email?community=newtown'
const post = (body: unknown) => POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }))
const sender = (email: string, pageChangedAt: string | null) => ({ url: `mailto:${email}`, createdBy: 'shul newsletters', pageChangedAt })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'newtown' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.getCommunityEmail.mockResolvedValue({ email: 'guide@gmail.com', canSave: true, checkedAt: '2026-11-25T10:00:00Z' })
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.saveCommunityEmail.mockResolvedValue(true)
})

describe('GET /api/admin/community-email', () => {
  it('answers with the address and when the last email came in', async () => {
    m.listWatches.mockResolvedValue({
      watches: [sender('a@shul.org', '2026-11-20T00:00:00Z'), sender('b@shul.org', '2026-11-24T00:00:00Z'), { url: 'https://shul.org', createdBy: 'admin', pageChangedAt: '2026-11-25T00:00:00Z' }],
      available: true,
    })
    const body = await (await GET(new Request(url))).json()
    expect(body).toMatchObject({ ok: true, email: 'guide@gmail.com', checkedAt: '2026-11-25T10:00:00Z', lastEmailAt: '2026-11-24T00:00:00Z' })
  })

  it('is for this community’s admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(new Request(url))).status).toBe(401)
  })
})

describe('POST /api/admin/community-email', () => {
  it('saves an address', async () => {
    const res = await post({ email: ' guide@gmail.com ' })
    expect(res.status).toBe(200)
    expect(m.saveCommunityEmail).toHaveBeenCalledWith('newtown', 'guide@gmail.com')
  })

  it('refuses what isn’t an address', async () => {
    expect((await post({ email: 'guide' })).status).toBe(400)
    expect(m.saveCommunityEmail).not.toHaveBeenCalled()
  })

  it('says so before migration 116', async () => {
    m.saveCommunityEmail.mockResolvedValue(false)
    expect((await post({ email: 'guide@gmail.com' })).status).toBe(503)
  })
})
