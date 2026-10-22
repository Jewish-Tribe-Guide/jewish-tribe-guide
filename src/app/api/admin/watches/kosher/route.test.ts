import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '@/lib/watches'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  listWatches: vi.fn(),
  getListReads: vi.fn(),
  readKeystoneList: vi.fn(),
  readMekorList: vi.fn(),
  rows: {} as Record<string, unknown[]>,
  filters: [] as [string, string, unknown][],
  jobFindings: vi.fn(),
  listCategories: vi.fn(),
  listApprovedResources: vi.fn(),
  single: {} as Record<string, unknown>,
  submitListingUpdate: vi.fn(),
  submitListingDelete: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/watchFindingStore', () => ({ jobFindings: m.jobFindings }))
vi.mock('@/lib/categoryStore', () => ({ listCategories: m.listCategories }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listApprovedResources }))
vi.mock('@/lib/submissionStore', () => ({
  submitListingUpdate: m.submitListingUpdate,
  submitListingDelete: m.submitListingDelete,
  approveSubmission: m.approveSubmission,
  rejectSubmission: m.rejectSubmission,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, getListReads: m.getListReads }))
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
        maybeSingle: async () => ({ data: m.single[table] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.rows[table === 'submission' ? name : table] ?? [], error: null }).then(ok),
      }
      return q
    },
  }),
}))

const { GET, POST } = await import('./route')
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
  m.getListReads.mockResolvedValue(new Map())
  m.readKeystoneList.mockResolvedValue({ entries: [judahEntry] })
  m.readMekorList.mockResolvedValue({ error: 'Mekor Habracha’s list answered 503' })
  m.jobFindings.mockResolvedValue({ findings: [], decided: new Map() })
  m.listCategories.mockResolvedValue([])
  m.single = {}
  m.submitListingUpdate.mockResolvedValue({ id: 'filed' })
  m.submitListingDelete.mockResolvedValue({ id: 'filed' })
})

// As dev's restaurants are set up (Oct 22).
const RESTAURANT = makeCategory({
  id: 'restaurant',
  detailFields: [
    { key: 's', label: 'Short Description', type: 'text', renderAs: 'row' },
    { key: 't', label: 'Food Type', type: 'select', renderAs: 'badge', options: ['Meat', 'Dairy', 'Parve'].map((v) => ({ label: v, value: v })) },
    { key: 'kosherCert', label: 'Kosher Certification', type: 'select', renderAs: 'badge', caveat: { flagField: 'kosherPartial', noteField: 'kosherNote' }, options: [] },
    { key: 'kosherPartial', label: 'Everything here is kosher', type: 'boolean', renderAs: 'hidden' },
    { key: 'kosherNote', label: 'What isn’t kosher?', type: 'textarea', renderAs: 'hidden' },
    { key: 'foodType', label: 'Store Type', type: 'select', renderAs: 'badge', options: ['Restaurant', 'Bakery'].map((v) => ({ label: v, value: v })) },
    { key: 'k', label: 'Kosher Certification URL', type: 'url', renderAs: 'row' },
  ],
} as never)

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

  // Oct 22: the tab opening read both lists' websites every time. A list's
  // last read (the morning's, or Check now) is kept on its watch instead.
  it('a list its last read kept isn’t read again; its latest run failing is said beside it', async () => {
    m.getListReads.mockResolvedValue(
      new Map([
        ['k', { updated: null, entries: [judahEntry] }],
        ['m', { updated: 'Oct 20, 2026', entries: [] }],
      ]),
    )
    m.listWatches.mockResolvedValue({ watches: [KEYSTONE, { ...MEKOR, failingSince: '2026-10-22T10:00:00Z', lastError: 'Mekor Habracha’s list answered 503' }], available: true })
    const body = await (await GET(req())).json()
    expect(m.readKeystoneList).not.toHaveBeenCalled()
    expect(m.readMekorList).not.toHaveBeenCalled()
    expect(body.lists).toEqual([
      expect.objectContaining({ list: 'keystone', entries: 1, error: null }),
      expect.objectContaining({ list: 'mekor', entries: 0, updated: 'Oct 20, 2026', error: 'Mekor Habracha’s list answered 503' }),
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

describe('GET /api/admin/watches/kosher — each place’s Kosher box', () => {
  it('the food categories, each place’s box as it is, and what each finding would make it', async () => {
    m.listCategories.mockResolvedValue([RESTAURANT, makeCategory({ id: 'shul' })])
    m.rows.resource = [{ ...judah, details: { ...judah.details, s: 'Steaks' } }]
    m.rows[KEYSTONE_WATCH_NAME] = [
      { id: 'f1', operation: 'update', target_id: judah.id, payload: { details: { kosherCert: ['IKC', 'Keystone-K'], t: ['Meat'] } }, note: null, status: 'pending' },
      { id: 'f2', operation: 'create', target_id: null, payload: { name: 'Holy Bagel', address: '1 Bagel Way', category: 'restaurant', details: { kosherCert: ['Keystone-K'] } }, note: null, status: 'pending' },
    ]
    const update = { id: 'f1', operation: 'update', targetId: judah.id, name: '', lines: [] }
    const create = { id: 'f2', operation: 'create', targetId: null, name: 'Holy Bagel', lines: [] }
    m.jobFindings.mockResolvedValue({ findings: [update, create], decided: new Map() })
    m.readKeystoneList.mockResolvedValue({ entries: [judahEntry, { ...judahEntry, slug: 'holy-bagel', url: 'https://keystone-k.org/kosher/holy-bagel/', name: 'Holy Bagel' }] })
    const body = await (await GET(req())).json()
    expect(body.categories.map((c: { id: string }) => c.id)).toEqual(['restaurant'])
    // The box's own fields, not the listing's description.
    expect(body.places[0].box).toEqual({ kosherCert: ['IKC'], t: ['Meat'] })
    expect(body.places[0].findings[0].values).toEqual({ kosherCert: ['IKC', 'Keystone-K'], t: ['Meat'] })
    expect(body.newPlaces[0].findings[0]).toMatchObject({ values: { kosherCert: ['Keystone-K'] }, address: '1 Bagel Way', category: 'restaurant' })
  })

  it('?item= is one food place’s listing and category, for Edit', async () => {
    m.listCategories.mockResolvedValue([RESTAURANT])
    m.listApprovedResources.mockResolvedValue([{ id: judah.id, category: 'restaurant', name: 'Judah Grille' }, { id: '1b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21', category: 'shul' }])
    const one = (id: string) => GET(new Request(`http://x/api/admin/watches/kosher?item=${id}`))
    const body = await (await one(judah.id)).json()
    expect(body).toMatchObject({ ok: true, item: { name: 'Judah Grille' }, category: { id: 'restaurant' } })
    expect((await one('1b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21')).status).toBe(404)
    expect((await one('nope')).status).toBe(400)
    expect(m.readKeystoneList).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/watches/kosher', () => {
  const FINDING = 'a1b2c3d4-0000-4000-8000-000000000001'
  const post = (body: object) => POST(new Request('http://x/api/admin/watches/kosher', { method: 'POST', body: JSON.stringify(body) }))
  const row = { ...judah, details: { kosherCert: ['Keystone-K'], t: ['Meat'], s: 'Steaks' } }
  const NEAR = `Not on Keystone-K's list.\nThe list does have "Judah Grill & Bar" (https://keystone-k.org/kosher/judah-grill-bar/). The same business under a new name?`
  const finding = (over: object = {}) => ({ id: FINDING, operation: 'delete', target_id: judah.id, payload: {}, note: NEAR, status: 'pending', submitted_by: { name: KEYSTONE_WATCH_NAME }, ...over })
  beforeEach(() => {
    m.listCategories.mockResolvedValue([RESTAURANT])
    m.single = { resource: row, submission: finding() }
  })
  const savedAs = () => m.submitListingUpdate.mock.calls[0]

  it('refuses anyone who isn’t this community’s admin, and anything it doesn’t know', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(401)
    m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
    expect((await post({ action: 'approve', id: FINDING })).status).toBe(400)
    expect((await post({ action: 'archive', id: 'nope' })).status).toBe(400)
    expect(m.approveSubmission).not.toHaveBeenCalled()
  })

  it('only a finding of one of the lists’, still waiting', async () => {
    m.single.submission = finding({ submitted_by: { name: 'Someone' } })
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(409)
    m.single.submission = finding({ status: 'rejected' })
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(409)
    m.single.submission = null
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(409)
    expect(m.approveSubmission).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('renamed: the list’s name and page, filed as the list’s, approved; the removal closes', async () => {
    expect((await post({ action: 'renamed', id: FINDING })).status).toBe(200)
    const [community, id, payload, , by] = savedAs()
    expect([community, id, by]).toEqual(['philly', judah.id, { name: KEYSTONE_WATCH_NAME }])
    expect(payload).toMatchObject({ name: 'Judah Grill & Bar', details: { ...row.details, k: 'https://keystone-k.org/kosher/judah-grill-bar/' } })
    expect(m.approveSubmission).toHaveBeenCalledWith('filed', 'philly', 'me@x.co')
    expect(m.rejectSubmission).toHaveBeenCalledWith(FINDING, 'philly', 'me@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('renamed with no near name in its note is refused', async () => {
    m.single.submission = finding({ note: 'Not on Keystone-K’s list.' })
    expect((await post({ action: 'renamed', id: FINDING })).status).toBe(400)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('archive: a removal is approved as it is', async () => {
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(200)
    expect(m.approveSubmission).toHaveBeenCalledWith(FINDING, 'philly', 'me@x.co')
    expect(m.submitListingDelete).not.toHaveBeenCalled()
    expect(m.rejectSubmission).not.toHaveBeenCalled()
  })

  it('archive: an edit leaving no hechsher files a removal as the list’s, and closes', async () => {
    const { MEKOR_WATCH_NAME } = await import('@/lib/mekorWatch')
    m.single.submission = finding({ operation: 'update', note: 'IKC dropped it.', submitted_by: { name: MEKOR_WATCH_NAME } })
    expect((await post({ action: 'archive', id: FINDING })).status).toBe(200)
    expect(m.submitListingDelete).toHaveBeenCalledWith('philly', judah.id, 'IKC dropped it.', { name: MEKOR_WATCH_NAME })
    expect(m.approveSubmission).toHaveBeenCalledWith('filed', 'philly', 'me@x.co')
    expect(m.rejectSubmission).toHaveBeenCalledWith(FINDING, 'philly', 'me@x.co')
  })

  it('edit on a removal: only the Kosher box’s fields, onto the listing as it is', async () => {
    expect((await post({ action: 'edit', id: FINDING, details: { kosherCert: ['IKC'], k: null, s: 'Hacked', name: 'x' } })).status).toBe(200)
    expect(savedAs()[2].details).toEqual({ kosherCert: ['IKC'], t: ['Meat'], s: 'Steaks', k: null })
    expect(m.rejectSubmission).toHaveBeenCalledWith(FINDING, 'philly', 'me@x.co')
    m.single.submission = finding({ operation: 'update' })
    expect((await post({ action: 'edit', id: FINDING, details: {} })).status).toBe(400)
  })

  it('page: its page on Keystone-K’s list, as its certificate link', async () => {
    expect((await post({ action: 'page', resourceId: judah.id, url: 'https://example.com/judah' })).status).toBe(400)
    expect((await post({ action: 'page', resourceId: judah.id, url: 'keystone-k.org/kosher/judah-grille' })).status).toBe(200)
    expect(savedAs()[2].details).toEqual({ ...row.details, k: 'https://keystone-k.org/kosher/judah-grille/' })
    expect(savedAs()[4]).toEqual({ name: KEYSTONE_WATCH_NAME })
    expect(m.approveSubmission).toHaveBeenCalledWith('filed', 'philly', 'me@x.co')
    expect(m.rejectSubmission).not.toHaveBeenCalled()
  })

  it('page for a place not in this guide’s food is refused', async () => {
    m.single.resource = { ...row, category: 'shul' }
    expect((await post({ action: 'page', resourceId: judah.id, url: 'keystone-k.org/kosher/judah-grille' })).status).toBe(404)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })
})
