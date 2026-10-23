import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  listEruvimForAdmin: vi.fn(),
  findEruvStatusPages: vi.fn(),
  updateEruv: vi.fn(),
  saveStatusRead: vi.fn(),
  saveLineRead: vi.fn(),
  readEruvMap: vi.fn(),
  saveEmailRead: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', timezone: 'America/New_York' }) }))
vi.mock('@/lib/eruvFind', () => ({ findEruvStatusPages: m.findEruvStatusPages }))
vi.mock('@/lib/eruvLines', () => ({ readEruvMap: m.readEruvMap }))
vi.mock('@/lib/eruvStore', () => ({
  listEruvimForAdmin: m.listEruvimForAdmin,
  updateEruv: m.updateEruv,
  saveStatusRead: m.saveStatusRead,
  addEruv: vi.fn(),
  removeEruv: vi.fn(),
  saveLineMissing: vi.fn(),
  saveLineRead: m.saveLineRead,
  saveEmailRead: m.saveEmailRead,
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

describe("POST /api/admin/eruvim { action: 'check' }", () => {
  it('Read them now dates its map’s read even when the map is the same', async () => {
    m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({ lineUrl: 'https://centercityeruv.com/map-data.geojson' })], available: true })
    m.readEruvMap.mockResolvedValue({ map: null, save: undefined, missing: [] })
    expect((await POST(req({ action: 'check', id: 'center-city' }))).status).toBe(200)
    expect(m.saveLineRead).toHaveBeenCalledWith('philly', 'center-city', { ok: true, file: null, at: expect.any(String) })
  })

  // Oct 23: Northeast's email was kept as unclear by a reader since fixed.
  // Check now reads a waiting email again, as the reader reads today.
  it('reads a waiting email again: read now, it goes live and is put away', async () => {
    const kept = { messageId: 'g1', subject: '[JCOR] Fw: Fwd: Parshas Lech Lecha 5787 - Eruv is UP', sentAt: '2026-10-23T17:56:17.000Z', text: 'Parshas Lech Lecha 5787 - Eruv is UP. Don’t assume the Eruv is down if you don’t get an email message.', words: 'Eruv is UP.' }
    m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({ id: 'northeast', statusEmail: 'jcor-ne-philadelphia@groups.io', statusEmailKept: kept })], available: true })
    await POST(req({ action: 'check', id: 'northeast' }))
    expect(m.saveEmailRead).toHaveBeenCalledWith('philly', 'northeast', { ok: true, status: 'up', words: 'Eruv is UP.', postedOn: '2026-10-23', at: kept.sentAt }, null)
  })

  it('a waiting email it still can’t read stays waiting', async () => {
    const kept = { messageId: 'g2', subject: 'Eruv dinner', sentAt: '2026-10-23T17:56:17.000Z', text: 'Eruv dinner. Join us Sunday.', words: null }
    m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({ id: 'northeast', statusEmailKept: kept })], available: true })
    await POST(req({ action: 'check', id: 'northeast' }))
    expect(m.saveEmailRead).not.toHaveBeenCalled()
  })

  it('saves a failed read as it is', async () => {
    m.listEruvimForAdmin.mockResolvedValue({ eruvim: [eruv({ lineUrl: 'https://centercityeruv.com/map-data.geojson' })], available: true })
    const save = { ok: false, error: 'The map answered 404', at: '2026-10-22T12:00:00Z' }
    m.readEruvMap.mockResolvedValue({ map: null, save, missing: null })
    await POST(req({ action: 'check', id: 'center-city' }))
    expect(m.saveLineRead).toHaveBeenCalledWith('philly', 'center-city', save)
  })
})
