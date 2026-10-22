import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeListing } from '@/test/providerFixtures'
import type { Watch, WatchCheck } from '@/lib/watches'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  hoursJobPlaces: vi.fn(),
  searchHoursPages: vi.fn(),
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  updateWatch: vi.fn(),
  removeWatch: vi.fn(),
  runAndRecord: vi.fn(),
  pending: [] as { target_id: string }[],
  jobFindings: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: async () => null }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/hoursJobRun', async (real) => ({ ...(await real<typeof import('@/lib/hoursJobRun')>()), hoursJobPlaces: m.hoursJobPlaces, searchHoursPages: m.searchHoursPages }))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, addWatch: m.addWatch, updateWatch: m.updateWatch, removeWatch: m.removeWatch }))
vi.mock('@/lib/watchRunner', () => ({ runAndRecord: m.runAndRecord }))
vi.mock('@/lib/watchFindingStore', () => ({ jobFindings: m.jobFindings }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: m.pending, error: null }).then(ok) }
      return q
    },
  }),
}))

const { GET, POST } = await import('./route')
const { HOURS_FOUND_CREATOR, HOURS_OFF_CREATOR, PAGE_STOPPED_CREATOR, hoursOffUrl } = await import('@/lib/hoursJob')
const { LISTING_PAGE_WATCH_CREATOR } = await import('@/lib/listingPageWatch')

const LMC = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const MEI = '7d1f3c2a-9b8e-4c6d-a5f4-3e2d1c0b9a87'
const NONE = '3c9e1a7b-5d2f-4e8a-b6c4-1f0e9d8c7b6a'
const MIKVAH = {
  id: 'mikvah',
  label: 'Mikvah',
  detailFields: [
    { key: 'hours', label: 'Hours', type: 'hours' },
    { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
    { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours' },
  ],
}
const req = (method: string, body?: unknown, query = '') => new Request(`http://x/api/admin/watches/hours${query}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const check = (result: WatchCheck['result']): WatchCheck => ({ at: new Date().toISOString(), what: 'hours', from: null, result, read: [], differences: [], queue: null })
const w = (over: Partial<Watch>) =>
  ({ id: 'w1', communityId: 'philly', kind: 'website', url: 'https://lmcmikvah.org/', resourceId: LMC, active: true, createdBy: HOURS_FOUND_CREATOR, label: 'Lower Merion Community Mikvah · its website', lastRunAt: new Date().toISOString(), lastCheck: check('agrees'), ...over }) as Watch

beforeEach(() => {
  vi.clearAllMocks()
  m.pending = []
  m.jobFindings.mockResolvedValue({ findings: [], decided: new Map() })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.hoursJobPlaces.mockResolvedValue({
    categories: [MIKVAH],
    places: [
      makeListing({ id: LMC, category: 'mikvah', name: 'Lower Merion Community Mikvah', website: 'http://lmcmikvah.org/' }),
      makeListing({ id: MEI, category: 'mikvah', name: 'Mikvah Mei Shalva', website: 'https://philamikvah.org/' }),
      makeListing({ id: NONE, category: 'mikvah', name: 'No Website Mikvah' }),
    ],
  })
  m.searchHoursPages.mockResolvedValue({ found: [], unloaded: [] })
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockImplementation(async (_c: string, x: Partial<Watch>) => w({ id: 'new', lastRunAt: null, lastCheck: null, ...x }))
  m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: { ...x, lastRunAt: 'now', lastCheck: check('agrees') } }))
})

describe('GET /api/admin/watches/hours', () => {
  it('refuses anyone who isn’t this community’s admin', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { action: 'off', resourceId: LMC }))).status).toBe(401)
  })

  it('lists each place with its pages, where each came from, what it found waiting to compare, and when one was decided', async () => {
    m.listWatches.mockResolvedValue({
      watches: [
        w({ id: 'home' }),
        w({ id: 'mens', url: 'https://lmcmikvah.org/mens-mikvah/', label: 'Lower Merion Community Mikvah · Men’s Mikvah' }),
        w({ id: 'given', url: 'https://lmcmikvah.org/keilim-mikvah/', createdBy: LISTING_PAGE_WATCH_CREATOR }),
      ],
      available: true,
    })
    // What it found, waiting to compare; and another's, decided.
    const finding = { id: 'f1', targetId: LMC, operation: 'update', lines: [] }
    const decided = { at: '2026-10-21T09:00:00Z', status: 'rejected' }
    m.jobFindings.mockResolvedValue({ findings: [finding, { ...finding, id: 'f2', targetId: 'elsewhere' }], decided: new Map([[MEI, decided]]) })
    const body = await (await GET(req('GET'))).json()
    expect(body.name).toBe('Mikvah hours')
    const lmc = body.places.find((p: { id: string }) => p.id === LMC)
    expect(lmc).toMatchObject({ findings: [finding], decided: null, off: false, reason: null, fields: ['Women’s Hours', 'Men’s Hours'] })
    expect(lmc.pages.map((p: { source: string }) => p.source)).toEqual(['Found from its website', 'Found from its website’s Men’s Mikvah link', 'Added by hand'])
    expect(body.places.find((p: { id: string }) => p.id === MEI).decided).toEqual(decided)
    expect(m.jobFindings).toHaveBeenCalledWith('philly', 'hours', [MIKVAH])
  })

  it('says why a place has nothing read: no website, its website, or no hours on it', async () => {
    m.searchHoursPages.mockImplementation(async (url: string) => (url.includes('philamikvah') ? { found: [], unloaded: [] } : { error: 'it couldn’t be reached' }))
    const body = await (await GET(req('GET'))).json()
    const reason = (id: string) => body.places.find((p: { id: string }) => p.id === id).reason
    expect(reason(MEI)).toBe('Read its website: no weekly hours on it.')
    expect(reason(NONE)).toBe('No website on Google.')
    expect(reason(LMC)).toBe('Its website wouldn’t open: it couldn’t be reached.')
    expect(body.places.every((p: { found: boolean }) => !p.found)).toBe(true)
    // Found just now: added, as the morning's run would, so its row has a
    // page to Check now and the Watches tab counts it as not read yet.
    m.searchHoursPages.mockResolvedValue({ found: [{ url: 'https://philamikvah.org/hours', link: 'Hours' }], unloaded: [] })
    m.addWatch.mockImplementation(async (_c: string, x: Partial<Watch>) => w({ id: `new-${x.resourceId}`, lastRunAt: null, lastCheck: null, ...x }))
    const found = (await (await GET(req('GET'))).json()).places.find((p: { id: string }) => p.id === MEI)
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://philamikvah.org/hours', resourceId: MEI, label: 'Mikvah Mei Shalva · Hours', createdBy: HOURS_FOUND_CREATOR })
    expect(found).toMatchObject({ reason: null, pages: [{ watch: { id: `new-${MEI}`, url: 'https://philamikvah.org/hours' }, source: 'Found from its website’s Hours link' }] })
    expect(m.runAndRecord).not.toHaveBeenCalled()
    // A place with pages isn't searched again here, even when they're paused.
    m.listWatches.mockResolvedValue({ watches: [w({ lastCheck: check('nothing') }), w({ id: 'paused', resourceId: MEI, url: 'https://philamikvah.org/', active: false })], available: true })
    m.searchHoursPages.mockClear()
    const again = await (await GET(req('GET'))).json()
    expect(again.places.find((p: { id: string }) => p.id === LMC).reason).toBe('Read its page: no weekly hours on it.')
    expect(again.places.find((p: { id: string }) => p.id === MEI).reason).toBeNull()
    expect(m.searchHoursPages).not.toHaveBeenCalled()
  })

  it('the Watches tab’s counts search nothing, so a slow website can’t hold the tab up', async () => {
    const body = await (await GET(new Request('http://x/api/admin/watches/hours?counts&community=philly'))).json()
    expect(body.places).toHaveLength(3)
    expect(m.searchHoursPages).not.toHaveBeenCalled()
    // Its reasons are the job page's to give.
    expect(body.places.find((p: { id: string }) => p.id === NONE).reason).toBeNull()
    expect(m.addWatch).not.toHaveBeenCalled()
  })
})

describe('the Shul times page (?job=times)', () => {
  const KESHER = '5e2d8c4a-1b3f-4d6e-9a7c-2f1e0d9c8b7a'
  beforeEach(() => {
    m.hoursJobPlaces.mockImplementation(async (_c: string, job: string) =>
      job === 'times'
        ? { categories: [{ id: 'synagogue', label: 'Shuls', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] }], places: [makeListing({ id: KESHER, category: 'synagogue', name: 'Kesher Israel', website: 'https://kesher.org/' })] }
        : { categories: [MIKVAH], places: [] },
    )
  })

  it('lists the shuls, searched for their times, in its own words', async () => {
    const body = await (await GET(req('GET', undefined, '?job=times'))).json()
    expect(m.hoursJobPlaces).toHaveBeenCalledWith('philly', 'times')
    expect(m.searchHoursPages).toHaveBeenCalledWith('https://kesher.org/', undefined, 'times')
    expect(body.name).toBe('Shul times')
    expect(body.places[0]).toMatchObject({ id: KESHER, fields: ['Davening Times'], reason: 'Read its website: no davening times on it.' })
    // And its POSTs are for its places.
    expect((await POST(req('POST', { action: 'off', resourceId: KESHER }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'off', resourceId: KESHER }, '?job=times'))).status).toBe(200)
    expect(m.addWatch).toHaveBeenCalledWith('philly', expect.objectContaining({ label: 'Kesher Israel: davening times not read' }))
  })
})

describe('a shul’s times, for its boxes and its Edit (?job=times)', () => {
  const SOI = '4a7a7af4-724c-4667-823b-df037f06cb00'
  const SHULS = { id: 'synagogue', label: 'Shuls', detailFields: [{ key: 'minyanim', label: 'Davening Times', type: 'minyanim' }] }
  const minyanim = [{ id: 'a', tefillah: 'shacharis', days: ['sun'], time: '8:00am' }]
  const week = { id: 'w', name: 'Times for Oct 21 – Oct 24', from: '2026-10-21', to: '2026-10-24', mode: 'replace', kind: 'week', minyanim: [] }
  beforeEach(() => {
    m.hoursJobPlaces.mockResolvedValue({ categories: [SHULS], places: [makeListing({ id: SOI, category: 'synagogue', name: 'Sons of Israel', website: 'https://soi.example/', minyanim, minyanim_schedules: [week] } as never)] })
  })

  it('each shul comes with its listing’s times, so a box can mark them; the hours page has none', async () => {
    const body = await (await GET(req('GET', undefined, '?job=times'))).json()
    expect(body.places[0].times).toEqual({ key: 'minyanim', minyanim, schedules: [week] })
    m.hoursJobPlaces.mockResolvedValue({ categories: [MIKVAH], places: [makeListing({ id: LMC, category: 'mikvah', name: 'Lower Merion Community Mikvah' })] })
    expect((await (await GET(req('GET'))).json()).places[0]).not.toHaveProperty('times')
  })

  it('?item=: one shul’s listing and category, for its Edit; not one the page doesn’t read, nor a bad id', async () => {
    const body = await (await GET(req('GET', undefined, `?job=times&item=${SOI}`))).json()
    expect(body).toMatchObject({ ok: true, item: { id: SOI, name: 'Sons of Israel' }, category: { id: 'synagogue' } })
    expect(m.listWatches).not.toHaveBeenCalled()
    expect((await GET(req('GET', undefined, `?job=times&item=${LMC}`))).status).toBe(404)
    expect((await GET(req('GET', undefined, '?job=times&item=nope'))).status).toBe(400)
  })
})

describe('a mikvah’s sections, for its boxes and its Edit', () => {
  const SECTIONED = {
    id: 'mikvah',
    label: 'Mikvah',
    detailFields: [
      { key: 'womenTevillah', label: 'Women’s Tevillah', type: 'boolean', filterLabel: 'Women’s' },
      { key: 'menTevillah', label: 'Men’s Tevillah', type: 'boolean', filterLabel: 'Men’s' },
      { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours', audienceKey: 'womenTevillah' },
      { key: 'women_s_notes', label: 'Women’s Notes', type: 'textarea', audienceKey: 'womenTevillah' },
      { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours', audienceKey: 'menTevillah' },
    ],
  }
  const hours = { mon: { open: '20:30', close: '22:30' } }

  it('each mikvah comes with the sections it has, each with its hours and notes as listed', async () => {
    m.hoursJobPlaces.mockResolvedValue({ categories: [SECTIONED], places: [makeListing({ id: MEI, category: 'mikvah', name: 'Mikvah Mei Shalva', womenTevillah: true, women_s_notes: 'By appointment.', women_s_hours: hours } as never)] })
    const body = await (await GET(req('GET'))).json()
    expect(body.places[0].sections).toEqual([
      { section: 'womenTevillah', label: 'Women’s', hours: 'women_s_hours', notes: 'women_s_notes', labels: ['Women’s Hours', 'Women’s Notes'], now: { women_s_hours: hours, women_s_notes: 'By appointment.' } },
    ])
    expect((await GET(req('GET', undefined, `?item=${MEI}`))).status).toBe(200)
  })

  // Mikvah hours board 1's Contact box: only what Google doesn't keep.
  it('each mikvah comes with its phone and email as listed, less what Google keeps', async () => {
    const withEmail = { ...SECTIONED, hasPhone: true, detailFields: [...SECTIONED.detailFields, { key: 'e', label: 'Email', type: 'text' }] }
    m.hoursJobPlaces.mockResolvedValue({
      categories: [withEmail],
      places: [
        makeListing({ id: MEI, category: 'mikvah', name: 'Mikvah Mei Shalva', phone: '(267) 225-2651', e: 'centercitymikvah@gmail.com' } as never),
        makeListing({ id: LMC, category: 'mikvah', name: 'Lower Merion Community Mikvah', phone: '(484) 808-5626', placeId: 'ChIJ', googleFields: ['phone'], e: 'office@lmcmikvah.org' } as never),
      ],
    })
    const [mei, lmc] = (await (await GET(req('GET'))).json()).places
    expect(mei.contact).toEqual({
      name: 'Contact',
      fields: [
        { key: 'phone', label: 'Phone', kind: 'phone', value: '(267) 225-2651' },
        { key: 'e', label: 'Email', kind: 'email', value: 'centercitymikvah@gmail.com' },
      ],
    })
    expect(lmc.contact).toEqual({ name: 'Email', fields: [{ key: 'e', label: 'Email', kind: 'email', value: 'office@lmcmikvah.org' }] })
  })
})

describe('POST /api/admin/watches/hours', () => {
  // The user, Oct 21: an admin "can remove or replace them".
  it('stop: any page, found or given, kept and never read, so the search never adds it again', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home' }), w({ id: 'mens', url: 'https://lmcmikvah.org/mens-mikvah/' })], available: true })
    const body = await (await POST(req('POST', { action: 'stop', resourceId: LMC, id: 'mens' }))).json()
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'mens', { createdBy: PAGE_STOPPED_CREATOR, active: false })
    expect(m.removeWatch).not.toHaveBeenCalled()
    expect(body.pages.map((p: { watch: Watch }) => p.watch.id)).toEqual(['home'])
    expect(body.stopped).toMatchObject([{ watch: { id: 'mens', active: false }, source: 'Stopped' }])
    expect(m.runAndRecord).not.toHaveBeenCalled()
    // Shown as stopped on the page, not as one it reads.
    const listed = await (await GET(req('GET'))).json()
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home' }), w({ id: 'mens', url: 'https://lmcmikvah.org/mens-mikvah/', createdBy: PAGE_STOPPED_CREATOR, active: false })], available: true })
    const after = (await (await GET(req('GET'))).json()).places.find((p: { id: string }) => p.id === LMC)
    expect(listed.places.find((p: { id: string }) => p.id === LMC).stopped).toEqual([])
    expect(after.pages.map((p: { watch: Watch }) => p.watch.id)).toEqual(['home'])
    expect(after.stopped.map((p: { watch: Watch }) => p.watch.id)).toEqual(['mens'])
    // Not another place's page.
    expect((await POST(req('POST', { action: 'stop', resourceId: MEI, id: 'home' }))).status).toBe(400)
  })

  it('again: a stopped page read again, as given by hand, straight away; giving it again does the same', async () => {
    const stopped = w({ id: 'mens', url: 'https://lmcmikvah.org/mens-mikvah/', createdBy: PAGE_STOPPED_CREATOR, active: false })
    m.listWatches.mockResolvedValue({ watches: [stopped], available: true })
    const body = await (await POST(req('POST', { action: 'again', resourceId: LMC, id: 'mens' }))).json()
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'mens', { createdBy: LISTING_PAGE_WATCH_CREATOR, active: true })
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'mens', active: true, createdBy: LISTING_PAGE_WATCH_CREATOR }), undefined, undefined, { full: true })
    expect(body).toMatchObject({ pages: [{ watch: { id: 'mens' }, source: 'Added by hand' }], stopped: [] })

    vi.clearAllMocks()
    m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: x }))
    const given = await POST(req('POST', { action: 'give', resourceId: LMC, url: 'lmcmikvah.org/mens-mikvah' }))
    expect(given.status).toBe(200)
    expect(m.addWatch).not.toHaveBeenCalled()
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'mens', { createdBy: LISTING_PAGE_WATCH_CREATOR, active: true })
  })


  // The user, Oct 21: "A way to have it check again", on every row.
  it('check: its pages read straight away; with none, its website searched now and what it finds read', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home' }), w({ id: 'mens', url: 'https://lmcmikvah.org/mens-mikvah/', lastCheck: check('differs') })], available: true })
    const body = await (await POST(req('POST', { action: 'check', resourceId: LMC }))).json()
    expect(m.runAndRecord.mock.calls.map(([x]) => x.id)).toEqual(['home', 'mens'])
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'home' }), undefined, undefined, { full: true })
    expect(body.pages.map((p: { watch: Watch }) => p.watch.lastRunAt)).toEqual(['now', 'now'])
    expect(m.searchHoursPages).not.toHaveBeenCalled()

    // One page after another, never at once: else each files what the
    // next would have seen waiting (Sons of Israel's three findings).
    vi.clearAllMocks()
    const order: string[] = []
    m.runAndRecord.mockImplementation(async (x: Watch) => {
      order.push(`start ${x.id}`)
      await new Promise((r) => setTimeout(r, 5))
      order.push(`end ${x.id}`)
      return { watch: x }
    })
    await POST(req('POST', { action: 'check', resourceId: LMC }))
    expect(order).toEqual(['start home', 'end home', 'start mens', 'end mens'])
    m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: { ...x, lastRunAt: 'now', lastCheck: check('agrees') } }))

    // Not read yet, no page: searched, added, read.
    vi.clearAllMocks()
    m.listWatches.mockResolvedValue({ watches: [], available: true })
    m.searchHoursPages.mockResolvedValue({ found: [{ url: 'https://philamikvah.org/hours', link: 'Hours' }], unloaded: [] })
    m.addWatch.mockImplementation(async (_c: string, x: Partial<Watch>) => w({ id: 'found', lastRunAt: null, lastCheck: null, ...x }))
    m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: { ...x, lastRunAt: 'now', lastCheck: check('agrees') } }))
    const found = await (await POST(req('POST', { action: 'check', resourceId: MEI }))).json()
    expect(m.addWatch).toHaveBeenCalledWith('philly', expect.objectContaining({ url: 'https://philamikvah.org/hours', resourceId: MEI, createdBy: HOURS_FOUND_CREATOR }))
    expect(found).toMatchObject({ reason: null, pages: [{ watch: { id: 'found', lastRunAt: 'now' } }] })

    // Nothing on its website: says so.
    m.searchHoursPages.mockResolvedValue({ found: [], unloaded: [] })
    expect(await (await POST(req('POST', { action: 'check', resourceId: MEI }))).json()).toMatchObject({ pages: [], reason: 'Read its website: no weekly hours on it.' })
  })

  it('check: not a place that’s turned off', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home', active: false }), w({ id: 'off', url: hoursOffUrl(LMC), createdBy: HOURS_OFF_CREATOR, active: false })], available: true })
    expect((await POST(req('POST', { action: 'check', resourceId: LMC }))).status).toBe(400)
    expect(m.runAndRecord).not.toHaveBeenCalled()
  })

  // The user, Oct 21: "a way to replace the source".
  it('give with replaces: the new page read, the old one stopped so the search never adds it again', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home' })], available: true })
    const body = await (await POST(req('POST', { action: 'give', resourceId: LMC, url: 'lmcmikvah.org/hours', replaces: 'home' }))).json()
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'home', { createdBy: PAGE_STOPPED_CREATOR, active: false })
    expect(body.pages.map((p: { watch: Watch }) => p.watch.url)).toEqual(['https://lmcmikvah.org/hours'])
    expect(body.stopped).toMatchObject([{ watch: { id: 'home' }, source: 'Stopped' }])
  })

  it('give: a page given by hand, read straight away, and its Off goes', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'off', url: hoursOffUrl(MEI), resourceId: MEI, createdBy: HOURS_OFF_CREATOR, active: false })], available: true })
    const body = await (await POST(req('POST', { action: 'give', resourceId: MEI, url: 'philamikvah.org/hours' }))).json()
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'off')
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://philamikvah.org/hours', resourceId: MEI, label: 'Mikvah Mei Shalva · hours on their website', createdBy: LISTING_PAGE_WATCH_CREATOR })
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }), undefined, undefined, { full: true })
    expect(body).toMatchObject({ ok: true, off: false, pages: [{ source: 'Added by hand' }] })
  })

  it('give: refuses a page read for another place, or not a web address', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ url: 'https://lmcmikvah.org/' })], available: true })
    const taken = await POST(req('POST', { action: 'give', resourceId: MEI, url: 'http://www.lmcmikvah.org' }))
    expect(taken.status).toBe(409)
    expect((await taken.json()).errors[0]).toBe('That page is read for Lower Merion Community Mikvah already.')
    expect((await POST(req('POST', { action: 'give', resourceId: MEI, url: 'mailto:x@y.org' }))).status).toBe(400)
    // Oct 21: Moishe Zvi's was given the guide's own listing page.
    const own = await POST(req('POST', { action: 'give', resourceId: MEI, url: 'https://phillyjewishguide.com/philly/mikvah?item=af8839dc' }))
    expect(own.status).toBe(400)
    expect((await own.json()).errors[0]).toBe('That’s a page of this guide. Give the place’s own website.')
    expect(m.addWatch).not.toHaveBeenCalled()
  })

  it('off: kept, so the search leaves it alone, and its pages stay, not read', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home' })], available: true })
    const body = await (await POST(req('POST', { action: 'off', resourceId: LMC }))).json()
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'home', { active: false })
    expect(m.addWatch).toHaveBeenCalledWith('philly', expect.objectContaining({ url: hoursOffUrl(LMC), createdBy: HOURS_OFF_CREATOR, active: false }))
    expect(body).toMatchObject({ off: true, pages: [{ watch: { id: 'home', active: false } }] })
    expect(m.runAndRecord).not.toHaveBeenCalled()
  })

  it('on: its pages read again straight away; with none, its website searched now', async () => {
    m.listWatches.mockResolvedValue({ watches: [w({ id: 'home', active: false }), w({ id: 'off', url: hoursOffUrl(LMC), createdBy: HOURS_OFF_CREATOR, active: false })], available: true })
    await POST(req('POST', { action: 'on', resourceId: LMC }))
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'off')
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'home', { active: true })
    expect(m.runAndRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'home', active: true }), undefined, undefined, { full: true })

    vi.clearAllMocks()
    m.listWatches.mockResolvedValue({ watches: [], available: true })
    m.searchHoursPages.mockResolvedValue({ found: [{ url: 'https://lmcmikvah.org/mens-mikvah/', link: 'Men’s Mikvah' }], unloaded: [] })
    m.addWatch.mockImplementation(async (_c: string, x: Partial<Watch>) => w({ id: 'found', ...x }))
    m.runAndRecord.mockImplementation(async (x: Watch) => ({ watch: x }))
    const body = await (await POST(req('POST', { action: 'on', resourceId: LMC }))).json()
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://lmcmikvah.org/mens-mikvah/', resourceId: LMC, label: 'Lower Merion Community Mikvah · Men’s Mikvah', createdBy: HOURS_FOUND_CREATOR })
    expect(body.pages.map((p: { source: string }) => p.source)).toEqual(['Found from its website’s Men’s Mikvah link'])
  })

  it('refuses a place whose hours aren’t read, and an unknown action', async () => {
    expect((await POST(req('POST', { action: 'off', resourceId: '9f8e7d6c-5b4a-4c3d-a2b1-0f9e8d7c6b5a' }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'remove', resourceId: LMC }))).status).toBe(400)
    expect((await POST(req('POST', { action: 'stop', resourceId: LMC }))).status).toBe(400)
  })
})
