import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERUV_WEBSITE_CREATOR, ERUV_WEBSITE_WATCH_NAME } from '@/lib/eruvWebsite'

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  eruvim: [] as unknown[],
  watches: [] as unknown[],
  pending: [] as unknown[],
  filters: [] as [string, unknown][],
  addWatch: vi.fn(),
  runAndRecord: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.admin }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', timezone: 'America/New_York' }) }))
vi.mock('@/lib/eruvStore', () => ({ listEruvimForAdmin: async () => ({ available: true, eruvim: m.eruvim }) }))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ available: true, watches: m.watches }), addWatch: m.addWatch }))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))
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

const { GET, POST } = await import('./route')
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

// Oct 22: an eruv's Details said nowhere where they're read from until the
// daily run gave its website a watch; Read them now gives it one.
describe("POST { action: 'read' }", () => {
  const post = (body: unknown) => POST(new Request('http://x/api/admin/watches/eruv', { method: 'POST', body: JSON.stringify(body) }))
  const LM = { id: 'lower-merion', name: 'Lower Merion Eruv', website: 'https://lowermerioneruv.org/' }
  const own = { id: 'w1', url: 'https://lowermerioneruv.org/', createdBy: ERUV_WEBSITE_CREATOR, active: true }

  beforeEach(() => {
    m.eruvim = [LM]
    m.runAndRecord.mockImplementation(async (w: object) => ({ watch: { ...w, lastOkAt: '2026-10-22T12:00:00Z' } }))
  })

  it('gives its website its watch, then reads it', async () => {
    m.watches = []
    m.addWatch.mockResolvedValue(own)
    const body = await (await post({ action: 'read', id: 'lower-merion' })).json()
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://lowermerioneruv.org/', resourceId: null, label: 'Lower Merion Eruv’s website', createdBy: ERUV_WEBSITE_CREATOR })
    expect(m.runAndRecord).toHaveBeenCalledWith(own)
    expect(body).toEqual({ ok: true, watch: { ...own, lastOkAt: '2026-10-22T12:00:00Z' } })
  })

  it('reads the one it has; a paused one isn’t read', async () => {
    m.watches = [own]
    await post({ action: 'read', id: 'lower-merion' })
    expect(m.addWatch).not.toHaveBeenCalled()
    expect(m.runAndRecord).toHaveBeenCalledWith(own)
    m.runAndRecord.mockClear()
    m.watches = [{ ...own, active: false }]
    expect(await (await post({ action: 'read', id: 'lower-merion' })).json()).toEqual({ ok: true, watch: { ...own, active: false } })
    expect(m.runAndRecord).not.toHaveBeenCalled()
  })

  it('none for an eruv with no website, or one another watch reads', async () => {
    m.eruvim = [{ ...LM, website: null }]
    expect((await post({ action: 'read', id: 'lower-merion' })).status).toBe(400)
    m.eruvim = [LM]
    m.watches = [{ id: 'w9', url: 'https://lowermerioneruv.org/', createdBy: null, active: true }]
    expect((await post({ action: 'read', id: 'lower-merion' })).status).toBe(400)
    expect(m.addWatch).not.toHaveBeenCalled()
    expect(m.runAndRecord).not.toHaveBeenCalled()
  })

  it('is for admins only', async () => {
    m.admin.mockResolvedValue(null)
    expect((await post({ action: 'read', id: 'lower-merion' })).status).toBe(401)
  })
})
