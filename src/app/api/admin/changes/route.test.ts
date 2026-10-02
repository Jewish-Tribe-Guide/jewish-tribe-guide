import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  listChangeLogUncached: vi.fn(),
  setChangeHidden: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/changesStore', async () => ({
  ...(await vi.importActual<object>('@/lib/changesStore')),
  listChangeLogUncached: m.listChangeLogUncached,
  setChangeHidden: m.setChangeHidden,
}))

const { GET, PATCH } = await import('./route')
const { MissingHiddenColumnError } = await import('@/lib/changesStore')
const req = (method: string, body?: unknown) =>
  new Request('http://x/api/admin/changes?community=philly', { method, body: body === undefined ? undefined : JSON.stringify(body) })

const listing = { id: 'aldi', name: 'ALDI', category: 'grocery', status: 'approved' }
const row = (id: number, over = {}) => ({ id, createdAt: `2026-10-0${id}T15:00:00Z`, kind: 'listing_edited', source: 'submission', item: null, submissionId: null, hidden: false, listing, ...over })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'philly', timezone: 'America/New_York' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listChangeLogUncached.mockResolvedValue([row(1), row(2, { hidden: true })])
})

describe('GET /api/admin/changes', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect(m.listChangeLogUncached).not.toHaveBeenCalled()
  })

  it('lists the changes, the hidden ones too, newest first', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.changes.map((c: { id: string; hidden: boolean }) => [c.id, c.hidden])).toEqual([
      ['2', true],
      ['1', false],
    ])
  })
})

describe('PATCH /api/admin/changes', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await PATCH(req('PATCH', { rowIds: [1], hidden: true }))).status).toBe(401)
    expect(m.setChangeHidden).not.toHaveBeenCalled()
  })

  it('hides the change’s rows in this community, then clears the cached pages', async () => {
    expect((await PATCH(req('PATCH', { rowIds: [3, 4], hidden: true }))).status).toBe(200)
    expect(m.setChangeHidden).toHaveBeenCalledWith('philly', [3, 4], true)
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('refuses anything that isn’t row ids and a yes or no', async () => {
    for (const body of [{ rowIds: [], hidden: true }, { rowIds: ['1'], hidden: true }, { rowIds: [1], hidden: 'yes' }, { rowIds: [1.5], hidden: false }]) {
      expect((await PATCH(req('PATCH', body))).status).toBe(400)
    }
    expect(m.setChangeHidden).not.toHaveBeenCalled()
  })

  it('before migration 068 says what’s missing', async () => {
    m.setChangeHidden.mockRejectedValue(new MissingHiddenColumnError())
    const res = await PATCH(req('PATCH', { rowIds: [1], hidden: true }))
    expect(res.status).toBe(409)
    expect((await res.json()).errors[0]).toMatch(/migration 068/)
  })
})
