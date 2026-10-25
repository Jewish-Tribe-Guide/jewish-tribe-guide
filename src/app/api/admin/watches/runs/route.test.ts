import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), listJobRuns: vi.fn(), listWatches: vi.fn(), loadGoogleJob: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/jobRunStore', () => ({ listJobRuns: m.listJobRuns }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))
vi.mock('@/lib/googleJobRun', () => ({ loadGoogleJob: m.loadGoogleJob }))

const { GET } = await import('./route')
const get = () => GET(new Request('http://x/api/admin/watches/runs'))

const RUN = { id: 'r', job: 'watches', startedAt: '2026-10-24T07:47:00.000Z', finishedAt: null, ok: null, summary: null, warning: null, error: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listJobRuns.mockResolvedValue({ available: true, runs: { 'sync-hours': [], watches: [RUN], 'read-menus': [], 'walk-routes': [] } })
  m.listWatches.mockResolvedValue({ available: true, watches: [] })
  m.loadGoogleJob.mockResolvedValue([])
})

describe('/api/admin/watches/runs', () => {
  it('admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(m.listJobRuns).not.toHaveBeenCalled()
  })

  it('a line per kind of source, from this community’s watches and Google places', async () => {
    const body = await (await get()).json()
    expect(body.available).toBe(true)
    expect(body.kinds.map((k: { name: string }) => k.name)).toEqual(['Google', 'Kosher certification', 'Hospitals', 'Eruvs', 'Minyan times', 'Websites', 'Menus'])
    expect(m.listWatches).toHaveBeenCalledWith('philly')
    expect(m.loadGoogleJob).toHaveBeenCalledWith('philly', expect.any(Number))
  })

  it('says when the table isn’t there yet', async () => {
    m.listJobRuns.mockResolvedValue({ available: false, runs: { 'sync-hours': [], watches: [], 'read-menus': [], 'walk-routes': [] } })
    expect((await (await get()).json()).available).toBe(false)
  })
})
