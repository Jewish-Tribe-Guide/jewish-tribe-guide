import { beforeEach, expect, it, vi } from 'vitest'
import { ERUV_WEBSITE_CREATOR, ERUV_WEBSITE_WATCH_NAME } from '@/lib/eruvWebsite'

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  eruvim: [] as unknown[],
  watches: [] as unknown[],
  pending: [] as unknown[],
  filters: [] as [string, unknown][],
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.admin }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', timezone: 'America/New_York' }) }))
vi.mock('@/lib/eruvStore', () => ({ listEruvimForAdmin: async () => ({ available: true, eruvim: m.eruvim }) }))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ available: true, watches: m.watches }) }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          m.filters.push([col, v])
          return q
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.pending, error: null }).then(ok),
      }
      return q
    },
  }),
}))

const { GET } = await import('./route')
const req = () => new Request('http://x/api/admin/watches/eruv')

beforeEach(() => {
  vi.clearAllMocks()
  m.filters = []
  m.admin.mockResolvedValue({ email: 'admin@example.org' })
})

it('every eruv, what its website says waiting, and only its websites’ watches', async () => {
  m.eruvim = [{ id: 'lower-merion', name: 'Lower Merion Eruv' }]
  m.watches = [
    { id: 'w1', url: 'https://lowermerioneruv.org/', createdBy: ERUV_WEBSITE_CREATOR },
    { id: 'w2', url: 'https://shul.org/', createdBy: 'listing pages' },
  ]
  m.pending = [{ id: 's1', created_at: '2026-10-22T10:00:00Z', payload: { eruvId: 'lower-merion', name: 'Lower Merion Eruv', covers: 'x', website: 'y', hotline: '(610) 555-0199', alertsUrl: null } }]
  const body = await (await GET(req())).json()
  expect(body).toEqual({
    ok: true,
    available: true,
    timezone: 'America/New_York',
    eruvim: m.eruvim,
    findings: [{ id: 's1', eruvId: 'lower-merion', at: '2026-10-22T10:00:00Z', hotline: '(610) 555-0199', alertsUrl: null }],
    watches: [m.watches[0]],
  })
  expect(m.filters).toEqual(expect.arrayContaining([['status', 'pending'], ['target_type', 'eruv'], ['submitted_by->>name', ERUV_WEBSITE_WATCH_NAME]]))
})

it('is for admins only', async () => {
  m.admin.mockResolvedValue(null)
  expect((await GET(req())).status).toBe(401)
})
