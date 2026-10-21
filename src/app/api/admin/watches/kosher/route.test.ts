import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '@/lib/watches'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  listWatches: vi.fn(),
  readKeystoneList: vi.fn(),
  readMekorList: vi.fn(),
  rows: {} as Record<string, unknown[]>,
  filters: [] as [string, string, unknown][],
  jobFindings: vi.fn(),
}))
vi.mock('@/lib/watchFindingStore', () => ({ jobFindings: m.jobFindings }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: async () => [] }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches }))
vi.mock('@/lib/keystoneRun', () => ({ readKeystoneList: m.readKeystoneList }))
vi.mock('@/lib/mekorRun', () => ({ readMekorList: m.readMekorList, CATEGORIES: ['restaurant', 'grocery'] }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let name = ''
      const q = {
        select: () => q,
        in: () => q,
        eq: (col: string, v: unknown) => {
          m.filters.push([table, col, v])
          if (col === 'submitted_by->>name') name = String(v)
          return q
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.rows[table === 'submission' ? name : table] ?? [], error: null }).then(ok),
      }
      return q
    },
  }),
}))

const { GET } = await import('./route')
const { KEYSTONE_WATCH_NAME } = await import('@/lib/keystoneWatch')

const req = () => new Request('http://x/api/admin/watches/kosher')
const w = (over: Partial<Watch>) => ({ id: 'w1', communityId: 'philly', kind: 'website', active: true, createdBy: null, lastCheck: null, ...over }) as Watch
const KEYSTONE = w({ id: 'k', kind: 'keystone_list', url: 'https://keystone-k.org/establishments/' })
const MEKOR = w({ id: 'm', url: 'https://www.mekorhabracha.org/center-city' })

const judah = {
  id: '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21',
  status: 'approved',
  category: 'restaurant',
  name: 'Judah Grille',
  address: null,
  phone: null,
  anchor_id: 'community',
  distance: null,
  details: { kosherCert: ['IKC'], t: ['Meat'] },
}
const judahEntry = {
  slug: 'judah-grille',
  url: 'https://keystone-k.org/kosher/judah-grille/',
  name: 'Judah Grille',
  kinds: ['restaurants'],
  updated: null,
  address: '',
  phone: '',
  website: null,
  certification: 'Meat',
  levels: ['Meat'],
}

beforeEach(() => {
  vi.clearAllMocks()
  m.filters = []
  m.rows = { resource: [judah] }
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.listWatches.mockResolvedValue({ watches: [KEYSTONE, MEKOR], available: true })
  m.readKeystoneList.mockResolvedValue({ entries: [judahEntry] })
  m.readMekorList.mockResolvedValue({ error: 'Mekor Habracha’s list answered 503' })
  m.jobFindings.mockResolvedValue({ findings: [], decided: new Map() })
})

describe('GET /api/admin/watches/kosher', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    expect(m.readKeystoneList).not.toHaveBeenCalled()
  })

  it('says each list, read now, and a list that didn’t load', async () => {
    const body = await (await GET(req())).json()
    expect(body.lists).toEqual([
      expect.objectContaining({ list: 'keystone', entries: 1, error: null, watch: expect.objectContaining({ id: 'k' }) }),
      expect.objectContaining({ list: 'mekor', entries: null, error: 'Mekor Habracha’s list answered 503' }),
    ])
    expect(body.counts).toMatchObject({ toCheck: 1, didntLoad: 1 })
  })

  it('each food place, with its differences and a link to its listing', async () => {
    const body = await (await GET(req())).json()
    expect(body.places).toEqual([
      expect.objectContaining({
        name: 'Judah Grille',
        href: '/philly/restaurant/judah-grille-0b6c4c',
        differences: [expect.objectContaining({ list: 'keystone', filed: 'next' }), expect.objectContaining({ list: 'keystone' })],
      }),
    ])
  })

  it('a difference its read filed and an admin decided says so', async () => {
    m.rows[KEYSTONE_WATCH_NAME] = [
      {
        operation: 'update',
        target_id: judah.id,
        payload: { details: { ...judah.details, kosherCert: ['IKC', 'Keystone-K'], k: judahEntry.url } },
        note: null,
        status: 'rejected',
      },
    ]
    const body = await (await GET(req())).json()
    expect(body.places[0].differences.map((d: { filed: string }) => d.filed)).toEqual(['decided', 'decided'])
    expect(body.counts.toCheck).toBe(0)
  })

  // Step 6: what its reads filed waits beside the place, to compare.
  it('each finding beside its place, a new place’s by name, and one matching neither on its own', async () => {
    const f = (id: string, over: object) => ({ id, operation: 'update', targetId: null, name: '', lines: [], ...over })
    const mine = f('f1', { targetId: judah.id })
    const fresh = f('f2', { operation: 'create', name: 'Holy Bagel' })
    const stray = f('f3', { operation: 'create', name: 'Long Gone Deli' })
    m.jobFindings.mockResolvedValue({ findings: [mine, fresh, stray], decided: new Map() })
    m.readKeystoneList.mockResolvedValue({ entries: [judahEntry, { ...judahEntry, slug: 'holy-bagel', url: 'https://keystone-k.org/kosher/holy-bagel/', name: 'Holy Bagel' }] })
    const body = await (await GET(req())).json()
    expect(body.places[0]).toMatchObject({ findings: [mine], waiting: 1 })
    expect(body.newPlaces).toEqual([expect.objectContaining({ name: 'Holy Bagel', findings: [fresh] })])
    expect(body.others).toEqual([stray])
    // Judah, Holy Bagel and the stray one.
    expect(body.counts.toCheck).toBe(3)
    expect(m.jobFindings).toHaveBeenCalledWith('philly', 'kosher', [])
  })

  it('a paused list isn’t read, and a list with no watch is offered', async () => {
    m.listWatches.mockResolvedValue({ watches: [{ ...KEYSTONE, active: false }], available: true })
    const body = await (await GET(req())).json()
    expect(m.readKeystoneList).not.toHaveBeenCalled()
    expect(m.readMekorList).not.toHaveBeenCalled()
    expect(body.lists.map((l: { watch: unknown; url: string }) => [!!l.watch, l.url])).toEqual([
      [true, 'https://keystone-k.org/establishments/'],
      [false, 'https://www.mekorhabracha.org/center-city'],
    ])
    expect(body.places[0].differences).toEqual([])
  })

  it('reads only this community’s listings and suggestions', async () => {
    await GET(req())
    expect(m.filters.filter(([, col]) => col === 'community_id').map(([, , v]) => v)).toEqual(['philly', 'philly', 'philly'])
  })
})
