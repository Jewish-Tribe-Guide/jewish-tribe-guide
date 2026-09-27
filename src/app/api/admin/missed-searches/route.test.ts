import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  listSearchMissCounts: vi.fn(),
  listSearchMissDismissals: vi.fn(),
  setSearchMissDismissed: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/missedSearchStore', () => ({
  listSearchMissCounts: m.listSearchMissCounts,
  listSearchMissDismissals: m.listSearchMissDismissals,
  setSearchMissDismissed: m.setSearchMissDismissed,
}))

const { GET, POST } = await import('./route')
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/missed-searches?community=philly', {
    method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

const grocery = makeCategory({ id: 'grocery', detailFields: [{ key: 'm', label: 'Kosher items', type: 'tags' }] })
const hidden = makeCategory({ id: 'hotel', label: 'Hotel', pluralLabel: 'Hotels', capabilities: { add: false, edit: true, report: true, directorySearch: true, map: true } })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listCategories.mockResolvedValue([grocery, hidden])
  m.listApprovedResources.mockResolvedValue([
    { id: 'a1', category: 'grocery', name: 'ALDI', anchorId: 'community', distance: 0, address: '', m: ['Pretzels'] },
  ])
  m.listSearchMissCounts.mockResolvedValue([
    { key: 'pretzels', day: '2026-09-20', count: 1 },
    { key: 'dentist', day: '2026-09-25', count: 2 },
    { key: 'dentist', day: '2026-09-26', count: 1 },
  ])
  m.listSearchMissDismissals.mockResolvedValue({ dismissed: new Map(), available: true })
  m.setSearchMissDismissed.mockResolvedValue(undefined)
})

describe('GET /api/admin/missed-searches', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect(m.listSearchMissCounts).not.toHaveBeenCalled()
  })

  it('lists each search once, most searched first, run through today’s search', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.ok).toBe(true)
    expect(body.searches.map((s: { term: string; count: number; verdict: { kind: string } }) => [s.term, s.count, s.verdict.kind])).toEqual([
      ['dentist', 3, 'missing'],
      ['pretzels', 1, 'found'],
    ])
    expect(body.total).toBe(2)
    expect(body.dismissalsAvailable).toBe(true)
  })

  it('offers Add only for categories that take new listings', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.addable).toEqual([{ id: 'grocery', label: 'Grocery Store' }])
  })

  it('still loads when dismissals can’t be read yet, and says so', async () => {
    m.listSearchMissDismissals.mockResolvedValue({ dismissed: new Map(), available: false })
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).dismissalsAvailable).toBe(false)
  })
})

describe('POST /api/admin/missed-searches', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await POST(req('POST', { term: 'dentist', dismissed: true }))).status).toBe(401)
    expect(m.setSearchMissDismissed).not.toHaveBeenCalled()
  })

  it('dismisses by the same text the counter stores', async () => {
    expect((await POST(req('POST', { term: '  Peeled   Garlic ', dismissed: true }))).status).toBe(200)
    expect(m.setSearchMissDismissed).toHaveBeenCalledWith('philly', 'peeled garlic', true)
  })

  it('restores', async () => {
    await POST(req('POST', { term: 'dentist', dismissed: false }))
    expect(m.setSearchMissDismissed).toHaveBeenCalledWith('philly', 'dentist', false)
  })

  for (const [label, body] of [
    ['no term', { dismissed: true }],
    ['a term too short to have been counted', { term: 'ab', dismissed: true }],
    ['no dismissed flag', { term: 'dentist' }],
    ['a body that isn’t JSON', 'nope'],
  ] as const) {
    it(`refuses ${label}`, async () => {
      expect((await POST(req('POST', body))).status).toBe(400)
      expect(m.setSearchMissDismissed).not.toHaveBeenCalled()
    })
  }

  it('says migration 058 may be missing when the write fails', async () => {
    m.setSearchMissDismissed.mockRejectedValue(new Error('relation does not exist'))
    const res = await POST(req('POST', { term: 'dentist', dismissed: true }))
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/058/)
  })
})
