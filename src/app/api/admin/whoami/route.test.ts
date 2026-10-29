import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  listCommunityVisibility: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({
  getAdminUser: m.getAdminUser,
  getAdminUserForCommunity: m.getAdminUserForCommunity,
  isAllowedAdminEmail: () => false,
}))
vi.mock('@/lib/communityStore', () => ({ listCommunityVisibility: m.listCommunityVisibility }))

const { GET } = await import('./route')
const req = (community?: string) =>
  new Request(`http://x/api/admin/whoami${community ? `?community=${community}` : ''}`)

beforeEach(() => {
  vi.resetAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.getAdminUser.mockResolvedValue({ email: 'me@x.co' })
  m.listCommunityVisibility.mockResolvedValue({
    riverton: { visible: false, previewToken: 'tok-r' },
    philly: { visible: true, previewToken: 'tok-p' },
  })
})

describe('GET /api/admin/whoami', () => {
  it('lets a hidden community’s admin see its pages, in the gate’s own cookie', async () => {
    const res = await GET(req('riverton'))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('jpc_preview_riverton=tok-r')
    expect(cookie).toContain('Path=/riverton')
    expect(cookie).toContain('HttpOnly')
  })

  it('sets nothing for a community that’s already on show', async () => {
    const res = await GET(req('philly'))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('sets nothing for someone who isn’t its admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    const res = await GET(req('riverton'))
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(m.listCommunityVisibility).not.toHaveBeenCalled()
  })

  it('sets nothing on the superadmin console’s check', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
