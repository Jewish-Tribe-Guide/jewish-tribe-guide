import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  getSetupState: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/setupStore', () => ({ getSetupState: m.getSetupState }))

const { GET } = await import('./route')
const req = () => new Request('http://x/api/admin/setup?community=newtown')
const STATE = { logo: false, admins: 1, categories: 0, places: 0, heroWords: false }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'newtown', mission: 'A guide to Jewish Newtown' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.getSetupState.mockResolvedValue(STATE)
})

describe('GET /api/admin/setup', () => {
  it('answers with what this community has saved', async () => {
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, setup: STATE })
    expect(m.getSetupState).toHaveBeenCalledWith({ slug: 'newtown', mission: 'A guide to Jewish Newtown' })
  })

  it('is for this community’s admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(m.getSetupState).not.toHaveBeenCalled()
  })

  it('says so when it can’t be read', async () => {
    m.getSetupState.mockRejectedValue(new Error('down'))
    expect((await GET(req())).status).toBe(502)
  })
})
