import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), listJobRuns: vi.fn(), listWatches: vi.fn(), loadGoogleJob: vi.fn(), listUnreadMenus: vi.fn(), loadListings: vi.fn(), linkStandings: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/jobRunStore', () => ({ listJobRuns: m.listJobRuns }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))
vi.mock('@/lib/googleJobRun', () => ({ loadGoogleJob: m.loadGoogleJob }))
vi.mock('@/lib/menuPlaceRead', () => ({ listUnreadMenus: m.listUnreadMenus }))
vi.mock('@/lib/listingReads', () => ({ loadListings: m.loadListings }))
vi.mock('@/lib/linkCheckRun', () => ({ linkStandings: m.linkStandings }))

const { GET } = await import('./route')
const get = () => GET(new Request('http://x/api/admin/watches/runs'))

const RUN = { id: 'r', job: 'watches', startedAt: '2026-10-24T07:47:00.000Z', finishedAt: null, ok: null, summary: null, warning: null, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listJobRuns.mockResolvedValue({ available: true, runs: { 'sync-hours': [], watches: [RUN], 'read-menus': [], 'walk-routes': [] } })
  m.listWatches.mockResolvedValue({ available: true, watches: [] })
  m.loadGoogleJob.mockResolvedValue([])
  m.listUnreadMenus.mockResolvedValue([])
  m.loadListings.mockResolvedValue({ readsOf: () => null, nameOf: () => null })
  m.linkStandings.mockResolvedValue([])
})

describe('/api/admin/watches/runs', () => {
  it('Links: this community’s, from the link check', async () => {
    m.linkStandings.mockResolvedValue([{ resourceId: 'p', key: 'kosher_url', field: 'Kosher certificate', url: 'https://k.org/c', place: 'Sababa', category: 'restaurant', href: '/x', id: 'w', checkedAt: null, error: null, failingSince: null }])
    const body = await (await get()).json()
    expect(m.linkStandings).toHaveBeenCalledWith('philly')
    expect(body.kinds.find((k: { name: string }) => k.name === 'Links')).toMatchObject({ count: '1 link · not checked yet', tracked: [{ name: 'Sababa · Kosher certificate', status: 'Not checked yet' }] })
  })

  it('admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.listJobRuns).not.toHaveBeenCalled()
  })

  it('a line per kind of source, from this community’s watches and Google places', async () => {
    const body = await (await get()).json()
    expect(body.available).toBe(true)
    expect(body.kinds.map((k: { name: string }) => k.name)).toEqual(['Google', 'Kosher certification', 'Hospitals', 'Eruvs', 'Minyan times', 'Newsletters', 'Mikvah hours', 'Menus'])
    expect(m.listWatches).toHaveBeenCalledWith('philly')
    expect(m.loadGoogleJob).toHaveBeenCalledWith('philly', expect.any(Number))
  })

  // Oct 25: the read-menus job folded into Menus.
  it('Menus’ never read: this community’s food places whose menu was never read', async () => {
    m.listUnreadMenus.mockResolvedValue([{ id: 'f1', name: 'Bar Bombon' }])
    const startedAt = new Date(Date.now() - 3_600_000).toISOString()
    m.listJobRuns.mockResolvedValue({ available: true, runs: { 'sync-hours': [], watches: [{ ...RUN, startedAt, finishedAt: startedAt, ok: true }], 'read-menus': [], 'walk-routes': [] } })
    const body = await (await get()).json()
    expect(m.listUnreadMenus).toHaveBeenCalledWith('philly')
    expect(body.kinds.find((k: { id: string }) => k.id === 'menus')).toMatchObject({ count: '0 of 1 read', trouble: '1 never read', misses: [{ name: 'Bar Bombon', why: 'Never read', page: 'dishes' }] })
  })

  // Oct 25: a mikvah's page found as "its website" was under Minyan times.
  it('a listing’s page counts by its category', async () => {
    const startedAt = new Date(Date.now() - 3_600_000).toISOString()
    m.listJobRuns.mockResolvedValue({ available: true, runs: { 'sync-hours': [], watches: [{ ...RUN, startedAt, finishedAt: startedAt, ok: true }], 'read-menus': [], 'walk-routes': [] } })
    m.listWatches.mockResolvedValue({
      available: true,
      watches: [{ id: 'z', communityId: 'philly', kind: 'website', url: 'https://www.mikvahwestphilly.com/', resourceId: 'm1', label: 'Mikvah Moishe Zvi · its website', active: true, createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'listing pages (found)', lastRunAt: null, lastOkAt: null }],
    })
    m.loadListings.mockResolvedValue({ readsOf: (id: string) => (id === 'm1' ? 'hours' : null), nameOf: () => null })
    const body = await (await get()).json()
    expect(m.loadListings).toHaveBeenCalledWith(['philly'])
    expect(body.kinds.find((k: { id: string }) => k.id === 'hours')).toMatchObject({ count: '0 of 1 read', misses: [{ name: 'Mikvah Moishe Zvi', why: 'Never read', page: 'hours' }] })
    expect(body.kinds.find((k: { id: string }) => k.id === 'times')).toMatchObject({ count: 'Nothing to read' })
  })

  it('says when the table isn’t there yet', async () => {
    m.listJobRuns.mockResolvedValue({ available: false, runs: { 'sync-hours': [], watches: [], 'read-menus': [], 'walk-routes': [] } })
    expect((await (await get()).json()).available).toBe(false)
  })
})
