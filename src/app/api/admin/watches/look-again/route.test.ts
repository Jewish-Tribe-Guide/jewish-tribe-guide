import { beforeEach, describe, expect, it, vi } from 'vitest'

// Nov 23: the page shows Look again's runs only, so it reads only those.
// It read all seven jobs', which Sentry flagged as an N+1 (seven job_run
// reads a load).
const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), listJobRuns: vi.fn(), loadLookAgain: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/jobRunStore', () => ({ listJobRuns: m.listJobRuns }))
vi.mock('@/lib/lookAgainRun', () => ({ loadLookAgain: m.loadLookAgain, tryLook: vi.fn() }))

const { GET } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.loadLookAgain.mockResolvedValue({ available: true, items: [] })
  m.listJobRuns.mockResolvedValue({ available: true, runs: { 'look-again': [{ id: 'r' }] } })
})

describe('GET /api/admin/watches/look-again', () => {
  it('reads Look again’s runs, not every job’s', async () => {
    const body = await (await GET(new Request('http://x/api/admin/watches/look-again'))).json()
    expect(m.listJobRuns).toHaveBeenCalledWith('philly', ['look-again'])
    expect(body.runs).toEqual([{ id: 'r' }])
  })
})
