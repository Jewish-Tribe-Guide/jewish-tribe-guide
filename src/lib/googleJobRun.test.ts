import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from './watches'

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  watches: [] as unknown[],
  filed: [] as { targetId: string; payload: Record<string, unknown>; note: string | null; by: unknown }[],
  approved: [] as string[],
  fetchPlaceSync: vi.fn(),
  searchPlaces: vi.fn(),
  readOwnSiteNow: vi.fn(),
}))
vi.mock('@/lib/hoursJobRun', () => ({ readOwnSiteNow: m.readOwnSiteNow }))

// The resource table, in memory: select().eq()… awaited or maybeSingle(),
// and update(patch).eq()….
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const where: Record<string, unknown> = {}
      let patch: Record<string, unknown> | null = null
      const hits = () => m.rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => ((patch = p), q),
        eq: (k: string, v: unknown) => ((where[k] = v), q),
        maybeSingle: async () => ({ data: hits()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => {
          if (patch) for (const r of hits()) Object.assign(r, structuredClone(patch))
          return Promise.resolve({ data: patch ? null : hits(), error: null }).then(ok)
        },
      }
      return q
    },
  }),
}))

const FOOD = {
  id: 'restaurant',
  label: 'Food',
  pluralLabel: 'Food',
  hasPhone: true,
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'website', label: 'Website', type: 'url' },
  ],
}
const MIKVAH = { id: 'mikvah', label: 'Mikvah', pluralLabel: 'Mikvahs', detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }, { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }] }
const ONLINE = { id: 'online', label: 'Online', pluralLabel: 'Online', hasAddress: false, detailFields: [] }
vi.mock('@/lib/categoryStore', () => ({
  listCategoriesUncached: async () => [FOOD, MIKVAH, ONLINE],
  getCategoryById: async (_c: string, id: string) => [FOOD, MIKVAH, ONLINE].find((c) => c.id === id) ?? null,
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: async () => ({ watches: m.watches, available: true }) }))
vi.mock('@/lib/submissionStore', () => ({
  submitListingUpdate: async (_c: string, targetId: string, payload: Record<string, unknown>, note: string | null, by: unknown) => {
    m.filed.push({ targetId, payload: structuredClone(payload), note, by })
    return { id: `s${m.filed.length}` }
  },
  approveSubmission: async (id: string) => {
    m.approved.push(id)
    // As approval does: the listing takes the payload.
    const s = m.filed[Number(id.slice(1)) - 1]
    const row = m.rows.find((r) => r.id === s.targetId)!
    const details = { ...(s.payload.details as Record<string, unknown>) }
    delete details.googleAutofill
    Object.assign(row, { name: s.payload.name, phone: s.payload.phone || null, details })
  },
}))
vi.mock('@/lib/googlePlaces', async (importOriginal) => ({ ...(await importOriginal<object>()), fetchPlaceSync: m.fetchPlaceSync, searchPlaces: m.searchPlaces }))

const run = await import('./googleJobRun')

const NOW = Date.parse('2026-10-22T16:00:00Z')
const HOURS = { mon: { open: '07:30', close: '18:00' } }
const listing = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  community_id: 'philly',
  status: 'approved',
  category: 'restaurant',
  name: 'Temple Beth Zion-Beth Israel- Early Childhood Education',
  phone: '(215) 735-5148',
  address: '1800 Spruce St, Philadelphia, PA',
  anchor_id: 'all',
  distance: null,
  ...over,
  details: { placeId: 'ChIJ1', googleFields: ['phone'], website: 'https://bzbi.org/learn/preschool', googleSyncedAt: '2026-10-18T10:00:00Z', ...((over.details as object) ?? {}) },
})
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w1', url: 'https://bzbi.org/learn/preschool', resourceId: 'a1', createdBy: 'listing pages (found)', active: true, lastRunAt: '2026-10-22T08:00:00Z', lastOkAt: '2026-10-22T08:00:00Z', failingSince: null, lastError: null, ...over }) as Watch
const google = { name: 'BZBI Early Childhood Center', hours: HOURS, phone: '+1 215-735-5148', website: 'https://bzbi.org/learn/preschool', address: null }
const by = (p: { fields: { field: string; by: { kind: string } }[] }) => Object.fromEntries(p.fields.map((f) => [f.field, f.by.kind]))

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [listing()]
  m.watches = []
  m.filed = []
  m.approved = []
  m.fetchPlaceSync.mockResolvedValue(google)
  m.readOwnSiteNow.mockResolvedValue(false)
})

describe('who checks each field', () => {
  it('Google, where it keeps the field; nothing, elsewhere', async () => {
    const [p] = await run.loadGoogleJob('philly', NOW)
    expect(by(p)).toEqual({ name: 'nothing', hours: 'nothing', phone: 'google', website: 'nothing' })
    expect(p.section).toBe('to_check')
  })

  it('its website, for a page a job reads that loads: hours, phone and website for a food place', async () => {
    m.rows = [listing({ details: { placeId: null, googleFields: [] } })]
    m.watches = [watch({})]
    const [p] = await run.loadGoogleJob('philly', NOW)
    expect(by(p)).toEqual({ name: 'nothing', hours: 'website', phone: 'website', website: 'website' })
    expect(p.matched).toBe(false)
  })

  it('a page that stopped loading, or another listing’s, checks nothing', async () => {
    m.watches = [watch({ failingSince: '2026-10-20T08:00:00Z', lastError: 'gone' }), watch({ id: 'w2', resourceId: 'other' })]
    expect(by((await run.loadGoogleJob('philly', NOW))[0])).toEqual({ name: 'nothing', hours: 'nothing', phone: 'google', website: 'nothing' })
  })

  it('a menu link on its website checks the website only', async () => {
    m.watches = [watch({ createdBy: 'menu links', url: 'https://bzbi.org/menu' })]
    expect(by((await run.loadGoogleJob('philly', NOW))[0])).toEqual({ name: 'nothing', hours: 'nothing', phone: 'google', website: 'website' })
  })

  it('a website Google doesn’t have is the Links job’s once it opened that link (PKS, Oct 27)', async () => {
    const pks = 'https://www.phlfoodandshops.com/directory/pks-kosher-market/'
    const record = (over: Partial<Watch>) => watch({ id: 'l1', createdBy: 'link check', active: false, url: 'https://guide.invalid/link-check/a1/website', pageHash: pks, lastOkAt: '2026-11-01T09:00:00Z', ...over })
    m.rows = [listing({ details: { website: pks } })]
    m.watches = [record({})]
    const [p] = await run.loadGoogleJob('philly', NOW)
    expect(p.fields.find((f) => f.field === 'website')!.by).toEqual({ kind: 'links', at: '2026-11-01T09:00:00Z' })
    // Not when it didn't open, nor a check of the link it had before.
    m.watches = [record({ failingSince: '2026-11-01T09:00:00Z', lastError: 'Not found' })]
    expect(by((await run.loadGoogleJob('philly', NOW))[0]).website).toBe('nothing')
    m.watches = [record({ pageHash: 'https://pks.example/' })]
    expect(by((await run.loadGoogleJob('philly', NOW))[0]).website).toBe('nothing')
  })

  it('a mikvah’s page never checks its plain Hours', async () => {
    m.rows = [listing({ category: 'mikvah', details: { googleFields: ['phone', 'name'] } })]
    m.watches = [watch({})]
    expect(by((await run.loadGoogleJob('philly', NOW))[0])).toMatchObject({ hours: 'nothing', phone: 'google', name: 'google' })
  })

  it('a match Google stopped answering is Can’t be read, its fields Google’s as of its last answer', async () => {
    m.rows = [listing({ details: { googleFields: ['name', 'hours', 'phone', 'website'], googleSyncedAt: '2026-09-10T10:00:00Z', lastSyncError: 'NOT_FOUND', lastSyncFailedAt: '2026-10-22T10:00:00Z' } })]
    const [p] = await run.loadGoogleJob('philly', NOW)
    expect(p.section).toBe('cant_read')
    expect(p.fields[0].by).toEqual({ kind: 'google', at: '2026-09-10T10:00:00Z' })
  })

  it('only categories with an address, and a street only where a name is shared', async () => {
    m.rows = [
      listing({ id: 'g1', name: 'GIANT', address: '2200 Huntingdon Pike, Huntingdon Valley, PA' }),
      listing({ id: 'g2', name: 'GIANT', address: '50 E Wynnewood Rd, Wynnewood, PA' }),
      listing({ id: 'o1', category: 'online' }),
      listing({ id: 'a1' }),
    ]
    const places = await run.loadGoogleJob('philly', NOW)
    expect(places.map((p) => [p.id, p.street])).toEqual([
      ['g1', 'Huntingdon Pike'],
      ['g2', 'E Wynnewood Rd'],
      ['a1', null],
    ])
  })
})

describe('Check against Google', () => {
  it('hands Google what already matches, and keeps its answer to decide the rest', async () => {
    const p = await run.checkAgainstGoogle('philly', 'a1', NOW)
    expect(m.fetchPlaceSync).toHaveBeenCalledTimes(1)
    const details = m.rows[0].details as Record<string, unknown>
    expect(details.googleFields).toEqual(['phone', 'website'])
    expect(by(p)).toMatchObject({ website: 'google', name: 'nothing', hours: 'nothing' })
    expect(p.compare!.rows.filter((r) => r.changed).map((r) => [r.field, r.google])).toEqual([
      ['name', 'BZBI Early Childhood Center'],
      ['hours', expect.stringContaining('7:30')],
    ])
    expect(p.section).toBe('to_check')
  })

  it('needs a match', async () => {
    m.rows = [listing({ details: { placeId: null } })]
    await expect(run.checkAgainstGoogle('philly', 'a1', NOW)).rejects.toThrow(/no Google match/)
    expect(m.fetchPlaceSync).not.toHaveBeenCalled()
  })
})

describe('Use Google’s', () => {
  it('puts Google’s version of each change on the listing, filed as Google Maps, with Google keeping them', async () => {
    await run.checkAgainstGoogle('philly', 'a1', NOW)
    const p = await run.applyGoogles('philly', 'a1', 'admin@x.org', NOW + 1000)
    expect(m.fetchPlaceSync).toHaveBeenCalledTimes(1)
    expect(m.filed).toHaveLength(1)
    expect(m.filed[0].by).toEqual({ name: 'Google Maps' })
    expect(m.filed[0].payload.name).toBe('BZBI Early Childhood Center')
    const details = m.filed[0].payload.details as Record<string, unknown>
    expect(details.hours).toEqual(HOURS)
    expect(details.googleAutofill).toEqual({ name: 'BZBI Early Childhood Center', hours: JSON.stringify(HOURS) })
    expect(m.approved).toEqual(['s1'])
    expect(p.decided?.what).toBe('used')
  })

  it('Edit: saved as the admin left it; Google’s name left out where it shares nothing with theirs, or the match would go', async () => {
    await run.checkAgainstGoogle('philly', 'a1', NOW)
    const p = await run.editFromGoogle('philly', 'a1', { name: 'Spruce Street Preschool', hours: HOURS }, 'admin@x.org', NOW)
    expect(m.filed[0].payload.name).toBe('Spruce Street Preschool')
    expect((m.filed[0].payload.details as Record<string, unknown>).googleAutofill).toEqual({ hours: JSON.stringify(HOURS) })
    expect(m.filed[0].payload.phone).toBe('(215) 735-5148')
    expect(p.decided?.what).toBe('used')
  })
})

describe('Keep the listing', () => {
  it('changes nothing on it, and makes you the checker of what nothing checks, for a year', async () => {
    await run.checkAgainstGoogle('philly', 'a1', NOW)
    const p = await run.keepTheListing('philly', 'a1', NOW)
    expect(m.filed).toEqual([])
    expect(m.rows[0].name).toBe('Temple Beth Zion-Beth Israel- Early Childhood Education')
    expect((m.rows[0].details as Record<string, unknown>).hours).toBeUndefined()
    expect(by(p)).toEqual({ name: 'you', hours: 'you', phone: 'google', website: 'google' })
    expect(p.section).toBe('checked')
    expect(p.decided?.what).toBe('kept')
    // Months later it is still yours; a year on, nothing checks it again.
    const [later] = await run.loadGoogleJob('philly', NOW + 200 * 86_400_000)
    expect(later.section).toBe('checked')
    const [year] = await run.loadGoogleJob('philly', NOW + 366 * 86_400_000)
    expect(by(year)).toMatchObject({ name: 'nothing', hours: 'nothing' })
    expect(year.section).toBe('to_check')
  })
})

describe('Not on Google', () => {
  it('said once: the name becomes yours and the listing is checked', async () => {
    m.rows = [listing({ details: { placeId: null, googleFields: [] } })]
    m.watches = [watch({})]
    const p = await run.notOnGoogle('philly', 'a1', NOW)
    expect(by(p)).toEqual({ name: 'you', hours: 'website', phone: 'website', website: 'website' })
    expect(p.section).toBe('checked')
    expect(p.notOnGoogle).toBe(new Date(NOW).toISOString())
  })

  // Oct 25: CKids Philly was made "yours" whole, and showed as up to date
  // with nothing reading its website.
  it('reads its website first, and leaves you only what that doesn’t check', async () => {
    m.rows = [listing({ details: { placeId: null, googleFields: [] } })]
    m.readOwnSiteNow.mockImplementation(async () => ((m.watches = [watch({})]), true))
    const p = await run.notOnGoogle('philly', 'a1', NOW)
    expect(m.readOwnSiteNow).toHaveBeenCalledWith('philly', 'a1')
    expect(by(p)).toEqual({ name: 'you', hours: 'website', phone: 'website', website: 'website' })
    expect((m.rows[0].details as Record<string, unknown>).googleKept).toEqual({ name: new Date(NOW).toISOString() })
  })

  it('a website that won’t read leaves its fields to you, as before', async () => {
    m.rows = [listing({ details: { placeId: null, googleFields: [] } })]
    m.readOwnSiteNow.mockRejectedValue(new Error('it couldn’t be reached'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = await run.notOnGoogle('philly', 'a1', NOW)
    expect(by(p)).toEqual({ name: 'you', hours: 'you', phone: 'you', website: 'you' })
    expect((m.rows[0].details as Record<string, unknown>).notOnGoogle).toBe(new Date(NOW).toISOString())
  })

  it('not for a listing with a match', async () => {
    await expect(run.notOnGoogle('philly', 'a1', NOW)).rejects.toThrow(/has a Google match/)
    expect(m.readOwnSiteNow).not.toHaveBeenCalled()
  })

  it('drops a match Google stopped answering for', async () => {
    m.rows = [listing({ details: { lastSyncError: 'Google Places request failed', lastSyncFailedAt: '2026-09-10T14:00:00Z' } })]
    const p = await run.notOnGoogle('philly', 'a1', NOW)
    expect(p.matched).toBe(false)
    expect(by(p)).toEqual({ name: 'you', hours: 'you', phone: 'you', website: 'you' })
    expect(p.section).toBe('checked')
    const details = m.rows[0].details as Record<string, unknown>
    expect(details.placeId).toBeUndefined()
    expect(details.lastSyncError).toBeUndefined()
  })
})

// Oct 26: BZBI Early Childhood was matched to the temple. Keep as is
// left the match, so Google still "checked" its phone.
describe('Wrong place', () => {
  it('drops the match and all it said, and nothing checks the listing until it’s found or not on Google', async () => {
    await run.checkAgainstGoogle('philly', 'a1', NOW)
    await run.keepTheListing('philly', 'a1', NOW)
    Object.assign(m.rows[0].details as object, { businessStatus: 'CLOSED_TEMPORARILY', businessStatusKeptAt: '2026-10-20T10:00:00Z', googleDescription: 'A synagogue', verifiedPlaceId: 'ChIJ1' })
    const p = await run.wrongPlace('philly', 'a1', NOW)
    expect(p.matched).toBe(false)
    expect(p.compare).toBeNull()
    expect(p.decided ?? null).toBeNull()
    expect(p.closure).toBeNull()
    expect(by(p)).toEqual({ name: 'nothing', hours: 'nothing', phone: 'nothing', website: 'nothing' })
    expect(p.section).toBe('to_check')
    const details = m.rows[0].details as Record<string, unknown>
    for (const k of ['placeId', 'verifiedPlaceId', 'googleFields', 'googleCheck', 'googleKept', 'googleSyncedAt', 'businessStatus', 'businessStatusKeptAt', 'googleDescription']) expect(details[k], k).toBeUndefined()
    expect(details.googleWrong).toEqual(['ChIJ1'])
    // The listing itself is as it was.
    expect(details.website).toBe('https://bzbi.org/learn/preschool')
    expect(m.rows[0].phone).toBe('(215) 735-5148')
    expect(m.fetchPlaceSync).toHaveBeenCalledTimes(1)
  })

  it('its website, where read, still checks what it reads', async () => {
    m.watches = [watch({})]
    const p = await run.wrongPlace('philly', 'a1', NOW)
    expect(by(p)).toEqual({ name: 'nothing', hours: 'website', phone: 'website', website: 'website' })
  })

  it('Find it on Google doesn’t offer it again; a second wrong one is added', async () => {
    await run.wrongPlace('philly', 'a1', NOW)
    m.searchPlaces.mockResolvedValue([
      { placeId: 'ChIJ1', name: 'Temple Beth Zion-Beth Israel', address: '1800 Spruce St' },
      { placeId: 'ChIJ2', name: 'BZBI Early Childhood Center', address: '1800 Spruce St' },
    ])
    expect((await run.findOnGoogle('philly', 'a1')).map((f) => f.placeId)).toEqual(['ChIJ2'])
    await run.pickGooglePlace('philly', 'a1', 'ChIJ2', NOW)
    await run.wrongPlace('philly', 'a1', NOW)
    expect((m.rows[0].details as Record<string, unknown>).googleWrong).toEqual(['ChIJ1', 'ChIJ2'])
  })

  it('not for a listing with no match', async () => {
    m.rows = [listing({ details: { placeId: null } })]
    await expect(run.wrongPlace('philly', 'a1', NOW)).rejects.toThrow(/no Google match/)
  })
})

describe('Find it on Google, then a pick', () => {
  it('searches by the listing’s name and address unless given another', async () => {
    m.searchPlaces.mockResolvedValue([])
    await run.findOnGoogle('philly', 'a1')
    expect(m.searchPlaces).toHaveBeenLastCalledWith('Temple Beth Zion-Beth Israel- Early Childhood Education, 1800 Spruce St, Philadelphia, PA')
    await run.findOnGoogle('philly', 'a1', 'BZBI')
    expect(m.searchPlaces).toHaveBeenLastCalledWith('BZBI')
  })

  it('a pick becomes its match, what the old one said is dropped, and it’s compared at once', async () => {
    m.rows = [listing({ details: { lastSyncError: 'NOT_FOUND', lastSyncFailedAt: '2026-10-22T10:00:00Z', googleSyncedAt: '2026-09-10T10:00:00Z' } })]
    const p = await run.pickGooglePlace('philly', 'a1', 'ChIJnew', NOW)
    const details = m.rows[0].details as Record<string, unknown>
    expect(details.placeId).toBe('ChIJnew')
    expect(details.lastSyncError).toBeUndefined()
    expect(details.googleSyncedAt).toBeUndefined()
    expect(m.fetchPlaceSync).toHaveBeenCalledWith('ChIJnew')
    expect(p.section).toBe('to_check')
    expect(p.compare).not.toBeNull()
  })
})

describe('Show as open', () => {
  it('overrides Google’s closure, and back; Google’s own answer stays', async () => {
    m.rows = [listing({ details: { businessStatus: 'CLOSED_TEMPORARILY', businessStatusChangedAt: '2026-10-12T10:00:00Z' } })]
    let p = await run.showAsOpen('philly', 'a1', true, NOW)
    expect(p.closure).toEqual({ status: 'CLOSED_TEMPORARILY', shownOpen: true, since: '2026-10-12T10:00:00Z', readAt: '2026-10-18T10:00:00Z', kept: null })
    p = await run.showAsOpen('philly', 'a1', false, NOW)
    expect(p.closure?.shownOpen).toBe(false)
    expect((m.rows[0].details as Record<string, unknown>).businessStatusOverride).toBeUndefined()
  })
  it('Keep closed dates it, until Google changes its answer again', async () => {
    m.rows = [listing({ details: { businessStatus: 'CLOSED_TEMPORARILY', businessStatusChangedAt: '2026-10-12T10:00:00Z' } })]
    expect((await run.loadGoogleJob('philly', NOW))[0].closure?.kept).toBeNull()
    const p = await run.showAsOpen('philly', 'a1', false, NOW)
    expect(p.closure?.kept).toBe(new Date(NOW).toISOString())
    // Google reopened it and closed it again since: it asks again.
    ;(m.rows[0].details as Record<string, unknown>).businessStatusChangedAt = new Date(NOW + 86_400_000).toISOString()
    expect((await run.loadGoogleJob('philly', NOW + 2 * 86_400_000))[0].closure?.kept).toBeNull()
  })
  it('read when Google was last asked whether it’s open, which is more often than its fields', async () => {
    m.rows = [listing({ details: { placeId: 'P', businessStatus: 'CLOSED_TEMPORARILY', googleSyncedAt: '2026-08-28T10:00:00Z', googleStatusCheckedAt: '2026-10-21T10:00:00Z' } })]
    const [p] = await run.loadGoogleJob('philly', NOW)
    expect(p.closure?.readAt).toBe('2026-10-21T10:00:00Z')
    expect(p.readAt).toBe('2026-08-28T10:00:00Z')
  })
})
