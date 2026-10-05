import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { Watch } from '@/lib/watches'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  listWatches: vi.fn(),
  getWatch: vi.fn(),
  addWatch: vi.fn(),
  updateWatch: vi.fn(),
  removeWatch: vi.fn(),
  runAndRecord: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/watchStore', () => ({
  listWatches: m.listWatches,
  getWatch: m.getWatch,
  addWatch: m.addWatch,
  updateWatch: m.updateWatch,
  removeWatch: m.removeWatch,
}))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))

const { GET, POST } = await import('./route')
const SHUL = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const WATCH = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/watches?community=philly', { method, body: body === undefined ? undefined : JSON.stringify(body) })

const added = { id: WATCH, communityId: 'philly', kind: 'website', url: 'https://lowermerionsynagogue.org/' } as Watch

beforeEach(() => {
  vi.clearAllMocks()
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listCategories.mockResolvedValue([makeCategory({ id: 'synagogue', label: 'Synagogue' })])
  m.listApprovedResources.mockResolvedValue([makeListing({ id: SHUL, category: 'synagogue', name: 'Lower Merion Synagogue' })])
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockResolvedValue(added)
  m.runAndRecord.mockImplementation(async (w: Watch) => ({ watch: { ...w, lastRunAt: 'now' } }))
})

describe('/api/admin/watches', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { action: 'add', url: 'x.org' }))).status).toBe(401)
    expect(m.addWatch).not.toHaveBeenCalled()
  })

  it('lists the watches and the listings a page can keep current', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body).toMatchObject({ ok: true, available: true, watches: [] })
    expect(body.listings).toEqual([{ id: SHUL, name: 'Lower Merion Synagogue', categoryLabel: 'Synagogue' }])
  })

  it('adds a page typed without https, tied to a listing, and checks it at once', async () => {
    const res = await POST(req('POST', { action: 'add', url: ' lowermerionsynagogue.org ', resourceId: SHUL, label: 'Weekly times' }))
    expect(res.status).toBe(200)
    expect(m.addWatch).toHaveBeenCalledWith('philly', {
      kind: 'website',
      url: 'https://lowermerionsynagogue.org/',
      resourceId: SHUL,
      label: 'Weekly times',
      createdBy: 'me@x.co',
    })
    expect(m.runAndRecord).toHaveBeenCalledWith(added)
    expect((await res.json()).watch.lastRunAt).toBe('now')
  })

  it('reads Keystone-K’s list as a list, from its address', async () => {
    await POST(req('POST', { action: 'add', url: 'https://www.keystone-k.org/establishments' }))
    expect(m.addWatch.mock.calls[0][1].kind).toBe('keystone_list')
  })

  it('refuses what isn’t a web address, a listing from elsewhere, and a page already watched', async () => {
    expect((await POST(req('POST', { action: 'add', url: 'mailto:a@b.org' }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'add', url: 'x.org', resourceId: WATCH }))).status).toBe(400)
    m.addWatch.mockResolvedValue(null)
    expect((await POST(req('POST', { action: 'add', url: 'x.org' }))).status).toBe(409)
  })

  it('checks, pauses and removes only this community’s watches', async () => {
    m.getWatch.mockResolvedValue(null)
    expect((await POST(req('POST', { action: 'remove', id: WATCH }))).status).toBe(404)
    expect(m.removeWatch).not.toHaveBeenCalled()

    m.getWatch.mockResolvedValue(added)
    await POST(req('POST', { action: 'pause', id: WATCH }))
    expect(m.updateWatch).toHaveBeenCalledWith('philly', WATCH, { active: false })
    await POST(req('POST', { action: 'check', id: WATCH }))
    expect(m.runAndRecord).toHaveBeenCalledWith(added)
    await POST(req('POST', { action: 'remove', id: WATCH }))
    expect(m.removeWatch).toHaveBeenCalledWith('philly', WATCH)
  })
})
