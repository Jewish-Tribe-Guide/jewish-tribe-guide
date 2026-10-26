import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), linkStandings: vi.fn(), checkOneLink: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/linkCheckRun', () => ({ linkStandings: m.linkStandings, checkOneLink: m.checkOneLink }))

const { GET, POST } = await import('./route')

const HOK = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const get = () => new Request('http://x/api/admin/watches/links')
const post = (body: unknown) => new Request('http://x/api/admin/watches/links', { method: 'POST', body: JSON.stringify(body) })
const link = { resourceId: HOK, key: 'kosher_url', url: 'http://houseofkosher.com/Philadelphia', error: 'Not found' }

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.linkStandings.mockResolvedValue([link])
  m.checkOneLink.mockResolvedValue({ ...link, error: null })
})

it('refuses anyone but an admin, and opens nothing', async () => {
  m.getAdminUserForCommunity.mockResolvedValue(null)
  expect((await GET(get())).status).toBe(401)
  expect((await POST(post({ action: 'check', resourceId: HOK, key: 'kosher_url' }))).status).toBe(401)
  expect(m.checkOneLink).not.toHaveBeenCalled()
})

it('every link and how it last answered', async () => {
  expect(await (await GET(get())).json()).toEqual({ ok: true, links: [link] })
  expect(m.linkStandings).toHaveBeenCalledWith('philly')
})

it('Check it again: that one link, now', async () => {
  expect(await (await POST(post({ action: 'check', resourceId: HOK, key: 'kosher_url' }))).json()).toEqual({ ok: true, link: { ...link, error: null } })
  expect(m.checkOneLink).toHaveBeenCalledWith('philly', HOK, 'kosher_url')
})

it('says so when the listing has no such link, and refuses one not named', async () => {
  m.checkOneLink.mockResolvedValue(null)
  expect((await POST(post({ action: 'check', resourceId: HOK, key: 'website' }))).status).toBe(404)
  expect((await POST(post({ action: 'check', resourceId: 'nope', key: 'website' }))).status).toBe(400)
  expect((await POST(post({ action: 'remove', resourceId: HOK, key: 'website' }))).status).toBe(400)
  expect(m.checkOneLink).toHaveBeenCalledTimes(1)
})
