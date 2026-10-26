import { describe, expect, it } from 'vitest'
import { kindSourcesText, notWatched, placeSourcesText, watchKinds, type PagesPlace, type SitePlace, type WatchJobsIn } from './watchPlaces'
import type { Checker, GoogleFieldRow, GooglePlace } from './googleJob'
import type { Watch, WatchCheck } from './watches'
import type { AdminEruv } from './eruvStore'
import type { LinkStanding } from './linkCheck'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()
const BASE = '/philly/admin'

const f = (field: GoogleFieldRow['field'], kind: Checker['kind']): GoogleFieldRow => ({ field, label: { name: 'Name', hours: 'Hours', phone: 'Phone', website: 'Website' }[field], value: 'x', by: { kind } })
const google = (id: string, category: string, over: Partial<GooglePlace> = {}): GooglePlace => ({
  id,
  name: id,
  street: null,
  address: null,
  category,
  categoryLabel: category,
  href: `/philly/${category}/${id}`,
  matched: true,
  section: 'checked',
  fields: [f('name', 'google'), f('phone', 'google')],
  readAt: ago(10),
  failedAt: null,
  notOnGoogle: null,
  closure: null,
  compare: null,
  ...over,
})

const check = (result: WatchCheck['result']): WatchCheck => ({ at: ago(9), what: 'times', from: 'page', result, read: [], differences: [], queue: null })
const watch = (over: Partial<Watch> = {}): Watch => ({
  id: 'w',
  communityId: 'philly',
  kind: 'website',
  url: 'https://example.org/',
  resourceId: null,
  label: null,
  active: true,
  createdAt: ago(500),
  createdBy: null,
  lastRunAt: ago(9),
  lastOkAt: ago(9),
  lastError: null,
  failingSince: null,
  lastFiled: null,
  pageHash: 'h',
  pageChangedAt: null,
  lastCheck: check('agrees'),
  ...over,
})
const shul = (id: string, over: Partial<PagesPlace> = {}): PagesPlace => ({ id, name: id, href: `/philly/synagogue/${id}`, pages: [{ watch: watch() }], off: false, ...over })

const CATEGORIES: WatchJobsIn['categories'] = [
  { id: 'eruv-information', pluralLabel: 'Eruv', kind: 'eruv', hasAddress: true },
  { id: 'restaurant', pluralLabel: 'Food', kind: 'listing', hasAddress: true },
  { id: 'grocery', pluralLabel: 'Grocery', kind: 'listing', hasAddress: true },
  { id: 'synagogue', pluralLabel: 'Synagogues', kind: 'listing', hasAddress: true },
  { id: 'whatsapp', pluralLabel: 'WhatsApp Groups', kind: 'listing', hasAddress: false },
  { id: 'zmanim', pluralLabel: 'Zmanim', kind: 'zmanim', hasAddress: true },
]
const jobs = (over: Partial<WatchJobsIn>): WatchJobsIn => ({
  categories: CATEGORIES,
  google: [],
  dishes: null,
  hours: null,
  times: null,
  hospitals: null,
  kosher: null,
  eruvim: null,
  ...over,
})
const kind = (input: WatchJobsIn, id: string) => watchKinds(input, BASE, NOW).find((k) => k.id === id)!
const place = (input: WatchJobsIn, id: string) => watchKinds(input, BASE, NOW).flatMap((k) => k.places).find((p) => p.id === id)!

describe('watchKinds', () => {
  it('puts each place in one tab: waiting first, then not checked, then up to date', () => {
    const input = jobs({
      google: [
        google('ksi', 'synagogue'),
        google('lms', 'synagogue', { section: 'to_check', fields: [f('name', 'google'), f('website', 'nothing')] }),
        google('bzbi', 'synagogue', { section: 'to_check', fields: [f('name', 'google'), f('website', 'nothing')] }),
      ],
      times: [
        shul('ksi', { newsletters: [watch({ url: 'mailto:news@ksi.example', pageChangedAt: ago(30) })] }),
        shul('lms'),
        // A finding waits, though Google leaves its website unchecked too.
        shul('bzbi', { findings: [{ id: 'f1' }, { id: 'f2' }] }),
      ],
    })
    const k = kind(input, 'synagogue')
    expect(k.counts).toEqual({ waiting: 1, notChecked: 1, upToDate: 1 })
    expect(place(input, 'bzbi')).toMatchObject({ state: 'waiting', pill: '2 changes', href: '/philly/admin/watches/times' })
    expect(place(input, 'lms')).toMatchObject({ state: 'not_checked', pill: 'Website not checked', href: '/philly/admin/watches/google' })
    expect(place(input, 'ksi')).toMatchObject({ state: 'up_to_date', pill: null, href: '/philly/synagogue/ksi' })
    expect(placeSourcesText(place(input, 'ksi').sources)).toBe('Google · its website · its newsletter')
    expect(kindSourcesText(k.sources)).toBe('Google · their websites · newsletters')
  })

  it('counts what isn’t checked, naming it when there’s one', () => {
    const input = jobs({
      google: [
        google('rivka', 'restaurant', { matched: false, section: 'to_check', fields: [f('name', 'nothing'), f('hours', 'nothing'), f('phone', 'nothing')] }),
        google('sababa', 'restaurant', { section: 'cant_read', failedAt: '2026-09-10T14:00:00Z' }),
      ],
      dishes: [
        { id: 'rivka', name: 'rivka', href: '', dishes: [], website: 'https://rivka.example', menuUrl: null, reading: null },
        { id: 'sababa', name: 'sababa', href: '', dishes: ['Falafel'], website: null, menuUrl: 'https://sababa.example/menu', reading: { status: 'approved', readAt: ago(30), sourceUrl: 'https://sababa.example/menu' } },
      ],
    })
    expect(place(input, 'rivka')).toMatchObject({ state: 'not_checked', pill: '4 not checked', sources: [] })
    expect(place(input, 'sababa')).toMatchObject({ state: 'not_checked', pill: 'Google stopped answering Sep 10' })
    expect(placeSourcesText(place(input, 'sababa').sources)).toBe('Google · its menu')
  })

  it('leaves a page read but not compared yet up to date, not unchecked', () => {
    const input = jobs({ google: [google('new', 'synagogue')], times: [shul('new', { pages: [{ watch: watch({ lastRunAt: null, lastOkAt: null, lastCheck: null }) }] })] })
    expect(place(input, 'new').state).toBe('up_to_date')
  })

  it('puts a list’s finding on the listing it names, whatever its kind', () => {
    const input = jobs({
      google: [google('giant', 'grocery'), google('chalavita', 'restaurant')],
      kosher: {
        places: [{ id: 'chalavita', name: 'chalavita', category: 'restaurant', certs: [], levels: [], on: [{ list: 'keystone', name: 'Chalavita', url: '', says: '' }], differences: [], href: '' }],
        newPlaces: [],
        others: [{ id: 'f9', name: 'GIANT', targetId: 'giant', operation: 'update', from: 'Keystone-K’s list' }],
      },
    })
    expect(kind(input, 'grocery').counts).toEqual({ waiting: 1, notChecked: 0, upToDate: 0 })
    expect(kind(input, 'restaurant').counts).toEqual({ waiting: 0, notChecked: 0, upToDate: 1 })
    expect(place(input, 'giant')).toMatchObject({ pill: '1 change', href: '/philly/admin/watches/kosher' })
  })

  it('waits on a closure Google reports until it’s kept closed or shown open', () => {
    const closure = { status: 'CLOSED_TEMPORARILY' as const, shownOpen: false, since: '2026-10-12T14:00:00Z', readAt: ago(10), kept: null }
    const input = jobs({
      google: [
        google('ritas', 'restaurant', { closure }),
        google('kept', 'restaurant', { closure: { ...closure, kept: ago(5) } }),
        google('open', 'restaurant', { closure: { ...closure, shownOpen: true } }),
      ],
    })
    expect(place(input, 'ritas')).toMatchObject({ state: 'waiting', pill: 'Closed for now, says Google · Oct 12', rank: 'closed' })
    expect(place(input, 'kept').state).toBe('up_to_date')
    expect(place(input, 'open').state).toBe('up_to_date')
  })

  it('puts Waiting for you in the agreed order: off a list (red), closures, new places, changes', () => {
    const closure = { status: 'CLOSED_TEMPORARILY' as const, shownOpen: false, since: '2026-10-12T14:00:00Z', readAt: ago(10), kept: null }
    const input = jobs({
      google: [
        google('a-changes', 'restaurant', { compare: { at: ago(2), rows: [{ field: 'phone', label: 'Phone', google: '215', changed: true }] } }),
        google('b-closed', 'restaurant', { closure }),
        google('z-off', 'restaurant'),
      ],
      kosher: {
        places: [],
        newPlaces: [{ name: 'Aardvark Bakery', address: '', on: [{ list: 'mekor', name: 'Aardvark Bakery', url: '', says: '' }], archived: null, archivedId: null, filed: 'queued', findings: [{ id: 'n1', at: '2026-10-24T09:00:00Z' }] }],
        others: [{ id: 'f1', name: 'Z Off', targetId: 'z-off', operation: 'delete', from: 'Keystone-K’s list', at: '2026-10-24T09:00:00Z' }],
      },
    })
    const waiting = kind(input, 'restaurant').places.filter((p) => p.state === 'waiting')
    expect(waiting.map((p) => [p.name, p.pill])).toEqual([
      ['z-off', 'Off Keystone-K’s list · Oct 24'],
      ['b-closed', 'Closed for now, says Google · Oct 12'],
      ['Aardvark Bakery', 'New on Mekor Habracha’s list · Oct 24'],
      ['a-changes', '1 change'],
    ])
    expect(waiting[0].red).toBe(true)
    expect(waiting.slice(1).some((p) => p.red)).toBe(false)
  })

  it('lists a place only a kosher list has, under Food, with when', () => {
    const on = [{ list: 'mekor' as const, name: 'Magical Sweet Shop', url: '', says: '' }]
    const input = jobs({
      kosher: {
        places: [],
        newPlaces: [
          { name: 'Magical Sweet Shop', address: '', on, archived: null, archivedId: null, filed: 'queued', findings: [{ id: 'n1', at: '2026-10-24T09:00:00Z' }] },
          { name: 'Decided Already', address: '', on, archived: null, archivedId: null, filed: 'decided' },
        ],
        others: [{ id: 'n2', name: 'GIANT Huntingdon Valley', targetId: null, operation: 'create', from: 'Keystone-K’s list', at: '2026-10-18T09:00:00Z' }],
      },
    })
    const food = kind(input, 'restaurant')
    expect(food.places.map((p) => [p.name, p.pill])).toEqual([
      ['GIANT Huntingdon Valley', 'New on Keystone-K’s list · Oct 18'],
      ['Magical Sweet Shop', 'New on Mekor Habracha’s list · Oct 24'],
    ])
  })

  it('names a listing by its street when another has its name', () => {
    const input = jobs({ google: [google('g1', 'restaurant', { name: 'The Kosher Grill', street: 'S Broad St' }), google('g2', 'restaurant', { name: 'The Kosher Grill', street: 'Citizens Bank Way' })] })
    expect(kind(input, 'restaurant').places.map((p) => p.name)).toEqual(['The Kosher Grill · Citizens Bank Way', 'The Kosher Grill · S Broad St'])
  })

  it('lists the eruvim under the eruv kind, from their own standing', () => {
    const eruv = (over: Partial<AdminEruv>): AdminEruv => ({
      id: 'e', name: 'e', covers: null, website: null, hotline: null, alertsUrl: null, statusUrl: null, statusDated: false,
      status: null, statusWords: null, statusPostedOn: null, statusCheckedAt: null, statusErrorAt: null, statusError: null,
      lineUrl: null, sortOrder: 1, active: true, rawLine: null, lineReadAt: null, lineError: null, lineLeaveOut: [], lineHidePoints: false, lineMissing: [], lineColor: null,
      statusEmail: null, statusEmailKept: null,
      ...over,
    })
    const input = jobs({
      eruvim: {
        available: true,
        timezone: 'America/New_York',
        eruvim: [eruv({ id: 'ne', name: 'Northeast Eruv' }), eruv({ id: 'lm', name: 'Lower Merion Eruv', statusUrl: 'https://lmeruv.example', statusCheckedAt: ago(2), status: 'up' })],
        findings: [],
        watches: [],
      },
    })
    const k = kind(input, 'eruv-information')
    expect(k.counts).toEqual({ waiting: 0, notChecked: 1, upToDate: 1 })
    expect(place(input, 'ne')).toMatchObject({ state: 'not_checked', pill: 'No status' })
    expect(kindSourcesText(k.sources)).toBe('Their websites')
  })

  // Oct 25 (the user): "every category that has a watch of some sort should
  // be on the watch list. So grocery should go to grocery, and childcare
  // should get a new row for childcare."
  it('puts what a grocery’s own website found under Grocery, waiting there', () => {
    const site = (id: string, over: Partial<SitePlace> = {}): SitePlace => ({ id, name: id, category: 'grocery', href: `/philly/grocery/${id}`, pages: [{ watch: watch() }], ...over })
    const input = jobs({
      google: [google('giant', 'grocery', { fields: [f('name', 'google'), f('phone', 'website')] }), google('acme', 'grocery'), google('shoprite', 'grocery')],
      sites: [site('giant', { findings: [{ id: 'f1' }] }), site('shoprite', { pages: [{ watch: watch({ lastOkAt: ago(200), failingSince: ago(150), lastError: 'HTTP 500' }) }] })],
    })
    expect(kind(input, 'grocery').counts).toEqual({ waiting: 1, notChecked: 1, upToDate: 1 })
    expect(place(input, 'giant')).toMatchObject({ state: 'waiting', pill: '1 change', href: `${BASE}/watches/kind/grocery`, sources: ['google', 'website'] })
    expect(place(input, 'shoprite')).toMatchObject({ state: 'not_checked', pill: 'Website didn’t load' })
    expect(kind(input, 'grocery').sources).toEqual(['google', 'website'])
  })

  it('gives a kind Google doesn’t cover its row when its places’ websites are read', () => {
    const categories = [...CATEGORIES, { id: 'childcare', pluralLabel: 'Childcare', kind: 'listing', hasAddress: false }] as WatchJobsIn['categories']
    const input = jobs({ categories, sites: [{ id: 'ckids', name: 'CKids Philly', category: 'childcare', href: '/philly/childcare/ckids', pages: [{ watch: watch() }] }] })
    expect(kind(input, 'childcare')).toMatchObject({ label: 'Childcare', counts: { waiting: 0, notChecked: 0, upToDate: 1 }, sources: ['website'] })
    expect(place(input, 'ckids')).toMatchObject({ name: 'CKids Philly', listing: '/philly/childcare/ckids' })
  })

  // Oct 25: House of Kosher's kosher certificate link answered 404.
  const link = (over: Partial<LinkStanding>): LinkStanding => ({
    resourceId: 'r',
    key: 'kosher_url',
    field: 'Kosher Certification URL',
    url: 'http://houseofkosher.com/Philadelphia',
    place: 'House of Kosher',
    category: 'restaurant',
    href: '/philly/restaurant/r',
    id: 'w1',
    checkedAt: ago(30),
    error: 'Not found',
    failingSince: ago(30),
    ...over,
  })

  it('a link a listing shows that doesn’t open is Not checked, on its kind’s page', () => {
    const input = jobs({ google: [google('r', 'restaurant'), google('s', 'restaurant')], links: [link({}), link({ resourceId: 's', error: null, failingSince: null })] })
    expect(place(input, 'r')).toMatchObject({ state: 'not_checked', pill: 'Link doesn’t open', href: `${BASE}/watches/kind/restaurant` })
    expect(place(input, 's')).toMatchObject({ state: 'up_to_date' })
    // Not answering once isn't, yet.
    expect(place(jobs({ google: [google('r', 'restaurant')], links: [link({ error: 'Didn’t answer' })] }), 'r')).toMatchObject({ state: 'up_to_date' })
  })

  it('a place nothing else reads gets its row for a link that doesn’t open', () => {
    const input = jobs({ links: [link({ resourceId: 'g', place: 'Kosher Delivery', category: 'whatsapp', field: 'Join group', href: '/philly/whatsapp/g' })] })
    expect(kind(input, 'whatsapp')).toMatchObject({ label: 'WhatsApp Groups', counts: { waiting: 0, notChecked: 1, upToDate: 0 } })
    expect(place(input, 'g')).toMatchObject({ name: 'Kosher Delivery', state: 'not_checked', listing: '/philly/whatsapp/g' })
  })

  it('leaves out a kind with nothing in it, and keeps the site’s order', () => {
    const input = jobs({ google: [google('s', 'synagogue'), google('r', 'restaurant')] })
    expect(watchKinds(input, BASE, NOW).map((k) => k.label)).toEqual(['Food', 'Synagogues'])
  })
})

describe('kindSourcesText', () => {
  it('says the sources of a kind as drawn', () => {
    expect(kindSourcesText(['google', 'keystone', 'mekor', 'menu', 'website'])).toBe('Google · Keystone-K · Mekor Habracha · menus · websites')
    expect(kindSourcesText(['refuah', 'google'])).toBe('Refuah · Google')
    expect(kindSourcesText(['website', 'email'])).toBe('Their websites · emails')
  })
})

describe('notWatched', () => {
  it('names the listing kinds with no address', () => {
    expect(notWatched(CATEGORIES)).toEqual(['WhatsApp Groups'])
    expect(notWatched([...CATEGORIES, { id: 'old', pluralLabel: 'Old', kind: 'listing', hasAddress: false, active: false }])).toEqual(['WhatsApp Groups'])
  })
})
