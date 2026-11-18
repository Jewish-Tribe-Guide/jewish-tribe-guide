import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  isAllowedAdminEmail: vi.fn(),
  isAllowedForCommunity: vi.fn(),
  listCommunities: vi.fn(),
  sendAdminMagicLink: vi.fn(),
  createUser: vi.fn(),
  generateLink: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/adminAuth', () => ({ isAllowedAdminEmail: m.isAllowedAdminEmail, isAllowedForCommunity: m.isAllowedForCommunity }))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))
vi.mock('@/lib/email', () => ({ sendAdminMagicLink: m.sendAdminMagicLink }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ auth: { admin: { createUser: m.createUser, generateLink: m.generateLink } } }),
}))

const { POST } = await import('./route')
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://site.test/api/admin/request-link', { method: 'POST', headers, body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  m.enforceRateLimit.mockResolvedValue(null)
  m.isAllowedAdminEmail.mockReturnValue(true)
  m.isAllowedForCommunity.mockResolvedValue(true)
  m.listCommunities.mockResolvedValue([{ slug: 'philly' }])
  m.createUser.mockResolvedValue({ error: null })
  m.generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://link' } }, error: null })
})

describe('POST /api/admin/request-link', () => {
  it('links a community’s admin back to its admin on the guide’s own address', async () => {
    await post({ email: 'a@x.co', community: 'philly' }, { origin: 'https://phillyjewishguide.com' })
    expect(m.generateLink.mock.calls[0][0].options.redirectTo).toBe('https://phillyjewishguide.com/philly/admin')
  })

  // Anyone can post with any Origin, and the session lands in the link's
  // address, so another site's Origin would hand it an admin's sign-in.
  it('never links to a site that isn’t the guide, whatever the Origin header says', async () => {
    await post({ email: 'a@x.co', community: 'philly' }, { origin: 'https://evil.example' })
    expect(m.generateLink.mock.calls[0][0].options.redirectTo).toBe('http://site.test/philly/admin')
    await post({ email: 'a@x.co' }, { origin: 'https://evil.example' })
    expect(m.generateLink.mock.calls[1][0].options.redirectTo).toBe('http://site.test/admin')
  })
})
