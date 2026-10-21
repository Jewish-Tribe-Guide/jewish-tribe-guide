import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  listEruvimForAdmin: vi.fn(),
  findEruvStatusPages: vi.fn(),
  updateEruv: vi.fn(),
  saveStatusRead: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', timezone: 'America/New_York' }) }))
vi.mock('@/lib/eruvFind', () => ({ findEruvStatusPages: m.findEruvStatusPages }))
vi.mock('@/lib/eruvStore', () => ({
  listEruvimForAdmin: m.listEruvimForAdmin,
  updateEruv: m.updateEruv,
  saveStatusRead: m.saveStatusRead,
  addEruv: vi.fn(),
  removeEruv: vi.fn(),
  saveLineMissing: vi.fn(),
  saveLineRead: vi.fn(),
  saveEmailRead: vi.fn(),
}))

const { POST } = await import('./route')
const req = (body: unknown) => new Request('http://x/api/admin/eruvim', { method: 'POST', body: JSON.stringify(body) })
const eruv = (over: Record<string, unknown>) => ({ id: 'center-city', name: 'Center City', website: 'https://centercityeruv.com/', statusUrl: null, lineUrl: null, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({})], available: true })
})

describe("POST /api/admin/eruvim { action: 'find' }", () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await POST(req({ action: 'find', id: 'center-city' }))).status).toBe(401)
    expect(m.findEruvStatusPages).not.toHaveBeenCalled()
  })

  it('offers the pages its website has, and saves nothing', async () => {
    const page = { url: 'https://centercityeruv.com/', link: null, status: 'up', words: 'The eruv is currently up.' }
    m.findEruvStatusPages.mockResolvedValue({ found: [page] })
    const body = await (await POST(req({ action: 'find', id: 'center-city' }))).json()
    expect(m.findEruvStatusPages).toHaveBeenCalledWith('https://centercityeruv.com/')
    expect(body).toEqual({ ok: true, found: [page], error: null })
    expect(m.updateEruv).not.toHaveBeenCalled()
    expect(m.saveStatusRead).not.toHaveBeenCalled()
  })

  it('says why its website didn’t open', async () => {
    m.findEruvStatusPages.mockResolvedValue({ error: 'it says the page isn’t there (404)' })
    const body = await (await POST(req({ action: 'find', id: 'center-city' }))).json()
    expect(body).toEqual({ ok: true, found: [], error: 'Its website, https://centercityeruv.com/, wouldn’t open: it says the page isn’t there (404)' })
  })

  it('an eruv with no website is told to give its page', async () => {
    m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({ website: null })], available: true })
    const res = await POST(req({ action: 'find', id: 'center-city' }))
    expect(res.status).toBe(400)
    expect((await res.json()).errors).toEqual(['It has no website in the guide. Give its status page instead.'])
  })
})
