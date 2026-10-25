import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  removeWatch: vi.fn(),
  updateWatch: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let only: string[] | null = null
      const q = {
        select: () => q,
        eq: () => q,
        in: (_col: string, vals: string[]) => ((only = vals), q),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === 'community' ? [{ slug: 'philly' }] : m.rows.filter((r) => !only || only.includes(r.category as string)), error: null }).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, addWatch: m.addWatch, removeWatch: m.removeWatch, updateWatch: m.updateWatch }))
vi.mock('@/lib/categoryStore', () => ({
  listCategoriesUncached: async () => [
    {
      id: 'mikvah',
      label: 'Mikvah',
      detailFields: [
        { key: 'hours', label: 'Hours', type: 'hours' },
        { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' },
        { key: 'men_s_hours', label: 'Men’s Hours', type: 'hours' },
      ],
    },
    { id: 'synagogue', label: 'Shuls', detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] },
    {
      id: 'restaurant',
      kind: 'listing',
      label: 'Food',
      hasPhone: true,
      detailFields: [
        { key: 'hours', label: 'Hours', type: 'hours' },
        { key: 'dishes', label: 'Main dishes', type: 'tags', showCountInHeader: true, countLabel: 'main dish' },
      ],
    },
    { id: 'grocery', kind: 'listing', label: 'Grocery', hasPhone: true, detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }] },
    { id: 'hotel', kind: 'listing', label: 'Hotel', hasPhone: true, detailFields: [] },
    { id: 'cemetery', kind: 'listing', label: 'Cemetery', hasPhone: false, detailFields: [] },
  ],
}))

const { searchHoursPages, syncHoursWatches } = await import('./hoursJobRun')
const { HOURS_FOUND_CREATOR, HOURS_SEARCHED_CREATOR, hoursSearchedUrl } = await import('./hoursJob')

// Lower Merion's home page and two of its links, as they were Oct 21.
const HOME = '<a href="/appointments-and-membership/">Appointments and Membership</a><a href="/mens-mikvah/">Men’s Mikvah</a>'
const PAGES: Record<string, string> = {
  'https://lmcmikvah.org/': 'The mikvah will be open from 7:30PM – 9:30PM every weeknight.',
  'https://lmcmikvah.org/appointments-and-membership/': 'On Shabbos, by appointment only, one hour after candle lighting time.',
  'https://lmcmikvah.org/mens-mikvah/': 'Sunday – Thursday: 4:30 AM – 10 AM',
}
const reach = {
  fetchHome: vi.fn(async (url: string) => (url.includes('lmcmikvah') ? { url: 'https://lmcmikvah.org/', body: HOME } : { error: 'it couldn’t be reached' })),
  readPage: vi.fn(async (url: string) => (PAGES[url] ? { url, text: PAGES[url], pdf: null } : null)),
}
const row = (id: string, name: string, website: string | null, category = 'mikvah') => ({ id, community_id: 'philly', category, name, status: 'approved', details: website ? { website } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = [row('lmc', 'Lower Merion Community Mikvah', 'http://lmcmikvah.org/')]
  m.listWatches.mockResolvedValue({ watches: [], available: true })
  m.addWatch.mockImplementation(async () => ({ id: 'new' }))
})

describe('searchHoursPages', () => {
  // Its appointments page has no clock time, but says how Shabbos works:
  // a section's note, read since Oct 22.
  it('keeps the pages with a clock time or appointments on them, from its home page and its links', async () => {
    expect(await searchHoursPages('http://lmcmikvah.org/', reach)).toEqual({
      found: [
        { url: 'https://lmcmikvah.org/', link: null },
        { url: 'https://lmcmikvah.org/appointments-and-membership/', link: 'Appointments and Membership' },
        { url: 'https://lmcmikvah.org/mens-mikvah/', link: 'Men’s Mikvah' },
      ],
      unloaded: [],
    })
  })

  it('says why when its website doesn’t open, and which pages didn’t load', async () => {
    expect(await searchHoursPages('https://philamikvah.org/', reach)).toEqual({ error: 'it couldn’t be reached' })
    const slow = { ...reach, readPage: vi.fn(async (url: string) => (url.endsWith('mens-mikvah/') ? null : { url, text: PAGES[url], pdf: null })) }
    expect(await searchHoursPages('http://lmcmikvah.org/', slow)).toMatchObject({ unloaded: ['https://lmcmikvah.org/mens-mikvah/'] })
  })
  // Beth Zion-Beth Israel as Oct 21's check of every shul page found it:
  // five pages read, all showing its calendar's week, two of them its High
  // Holy Days pages; and the Rosenbach, a museum, read for its opening hours.
  it('a shul’s: its pages with davening times, its calendar read once, no holiday pages', async () => {
    const week = ['2026-10-22 (Thu) 7:45 AM: Monday & Thursday Morning Minyan']
    const bzbi: Record<string, string> = {
      'https://bzbi.org/': 'Welcome',
      'https://bzbi.org/worship/': 'Weekday Minyan, Monday–Friday 7:45 AM',
      'https://bzbi.org/worship/high-holy-days-sermons/': 'Kol Nidre sermon',
      'https://bzbi.org/worship/shabbat/': 'Shabbat morning',
      'https://bzbi.org/worship/hhd5786/': 'Rosh Hashanah services 9:30AM',
    }
    const shulReach = {
      fetchHome: async (url: string) =>
        url.includes('bzbi')
          ? { url: 'https://bzbi.org/', body: ['/worship/|Worship', '/worship/high-holy-days-sermons/|High Holy Days Sermons', '/worship/shabbat/|Shabbat', '/worship/hhd5786/|High Holy Days 2026/5787'].map((l) => `<a href="${l.split('|')[0]}">${l.split('|')[1]}</a>`).join('') }
          : { url: 'https://www.rosenbach.org/', body: '<a href="/about">About Us</a><a href="/visit">Visit in Person</a>' },
      readPage: async (url: string) =>
        url.includes('bzbi')
          ? { url, text: [...week, '', bzbi[url]].join('\n'), pdf: null, weeks: [{ sunday: '2026-10-18', from: '2026-10-21', to: '2026-10-24', lines: week }] }
          : { url, text: 'Thursday: 10:30am — 6:00pm\nSunday: 10:30am — 4:30pm', pdf: null },
    }
    expect(await searchHoursPages('http://www.bzbi.org/', shulReach, 'times')).toEqual({ found: [{ url: 'https://bzbi.org/worship/', link: 'Worship' }], unloaded: [] })
    expect(await searchHoursPages('http://rosenbach.org/', shulReach, 'times')).toEqual({ found: [], unloaded: [] })
  })
})

describe('syncHoursWatches', () => {
  it('watches each place’s hours pages, marked as found', async () => {
    expect(await syncHoursWatches(reach)).toEqual([{ community: 'philly', added: 3, removed: 0 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', {
      kind: 'website',
      url: 'https://lmcmikvah.org/mens-mikvah/',
      resourceId: 'lmc',
      label: 'Lower Merion Community Mikvah · Men’s Mikvah',
      createdBy: HOURS_FOUND_CREATOR,
    })
  })

  it('leaves a place alone when its website doesn’t open, it has none, or it takes too long', async () => {
    const own = { id: 'own', url: 'https://philamikvah.org/hours/', resourceId: 'mei', createdBy: HOURS_FOUND_CREATOR, active: true }
    m.rows = [row('mei', 'Mikvah Mei Shalva', 'https://philamikvah.org/'), row('none', 'No Website Mikvah', null)]
    m.listWatches.mockResolvedValue({ watches: [own], available: true })
    expect(await syncHoursWatches(reach)).toEqual([{ community: 'philly', added: 0, removed: 0 }])
    expect(m.removeWatch).not.toHaveBeenCalled()

    m.rows = [row('lmc', 'Lower Merion Community Mikvah', 'http://lmcmikvah.org/')]
    const never = { ...reach, fetchHome: () => new Promise<never>(() => {}) }
    expect(await syncHoursWatches(never, 10)).toEqual([{ community: 'philly', added: 0, removed: 0 }])
  })

  // The user, Oct 22: the job's page shows what the search found, rather
  // than search again each time it's opened.
  it('keeps why a place was left with no page, and takes it away once it has one', async () => {
    const searched = { id: 's1', url: hoursSearchedUrl('lmc', 'hours'), resourceId: 'lmc', createdBy: HOURS_SEARCHED_CREATOR, active: false }
    m.rows = [row('mei', 'Mikvah Mei Shalva', 'https://philamikvah.org/'), row('none', 'No Website Mikvah', null), row('lmc', 'Lower Merion Community Mikvah', 'http://lmcmikvah.org/')]
    m.listWatches.mockResolvedValue({ watches: [searched], available: true })
    m.addWatch.mockImplementation(async (_s: string, w: { url: string }) => ({ id: w.url }))
    await syncHoursWatches(reach)
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: hoursSearchedUrl('mei', 'hours'), resourceId: 'mei', label: 'Mikvah Mei Shalva: hours searched', createdBy: HOURS_SEARCHED_CREATOR, active: false })
    const why = Object.fromEntries(m.updateWatch.mock.calls.map(([, id, patch]) => [id, patch.lastError]))
    expect(why).toEqual({ [hoursSearchedUrl('mei', 'hours')]: 'Its website wouldn’t open: it couldn’t be reached.', [hoursSearchedUrl('none', 'hours')]: 'No website on Google.' })
    // Lower Merion's search found its pages: what it said before goes.
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 's1')
  })

  // Shuls (the user, Oct 21): their pages found by what a shul's website
  // calls them, Lower Merion's mikvah's by what a mikvah's does.
  it('watches each shul’s pages with times, found by the links a shul’s website has', async () => {
    const shul = '<a href="/davening">Davening</a><a href="/mens-mikvah/">Men’s Mikvah</a>'
    const shulReach = {
      fetchHome: vi.fn(async (url: string) => (url.includes('kesher') ? { url: 'https://kesher.org/', body: shul } : reach.fetchHome(url))),
      readPage: vi.fn(async (url: string) => (url === 'https://kesher.org/davening' ? { url, text: 'Shacharis 8:00 AM', pdf: null } : reach.readPage(url))),
    }
    m.rows = [row('lmc', 'Lower Merion Community Mikvah', 'http://lmcmikvah.org/'), row('kesher', 'Kesher Israel', 'https://kesher.org/', 'synagogue')]
    expect(await syncHoursWatches(shulReach)).toEqual([{ community: 'philly', added: 4, removed: 0 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://kesher.org/davening', resourceId: 'kesher', label: 'Kesher Israel · Davening', createdBy: HOURS_FOUND_CREATOR })
    // A shul's website isn't searched for a mikvah's links.
    expect(m.addWatch).not.toHaveBeenCalledWith('philly', expect.objectContaining({ resourceId: 'kesher', url: expect.stringContaining('mikvah') }))
  })

  // Main dishes board 3: a food place's website, for what Google doesn't keep.
  it('watches a food place’s website when Google keeps neither its hours nor its phone, unsearched', async () => {
    m.rows = [
      row('cv', 'Chalavita', 'chalavita.com', 'restaurant'),
      { ...row('goog', 'Googled Grill', 'https://grill.example/', 'restaurant'), details: { website: 'https://grill.example/', placeId: 'g', googleFields: ['hours', 'phone'] } },
    ]
    expect(await syncHoursWatches(reach)).toEqual([{ community: 'philly', added: 1, removed: 0 }])
    expect(m.addWatch).toHaveBeenCalledWith('philly', { kind: 'website', url: 'https://chalavita.com/', resourceId: 'cv', label: 'Chalavita · its website', createdBy: HOURS_FOUND_CREATOR })
    expect(reach.fetchHome).not.toHaveBeenCalled()
  })

  // Oct 25 (the user): every kind of place, only where Google doesn't have it.
  it('watches any kind of place’s website for what Google doesn’t keep', async () => {
    m.rows = [
      { ...row('gr', 'Corner Grocery', 'https://grocery.example/', 'grocery'), details: { website: 'https://grocery.example/', placeId: 'g', googleFields: ['phone'] } },
      { ...row('ho', 'Hotel Kept', 'https://hotel.example/', 'hotel'), details: { website: 'https://hotel.example/', placeId: 'g2', googleFields: ['phone'] } },
      row('hn', 'Hotel New', 'https://hotelnew.example/', 'hotel'),
      row('ce', 'Cemetery', 'https://cemetery.example/', 'cemetery'),
    ]
    expect(await syncHoursWatches(reach)).toEqual([{ community: 'philly', added: 2, removed: 0 }])
    expect(m.addWatch.mock.calls.map((c) => c[1].resourceId)).toEqual(['gr', 'hn'])
  })

  it('takes away its own page it no longer finds', async () => {
    m.listWatches.mockResolvedValue({ watches: [{ id: 'old', url: 'https://lmcmikvah.org/old-hours/', resourceId: 'lmc', createdBy: HOURS_FOUND_CREATOR, active: true }], available: true })
    expect(await syncHoursWatches(reach)).toEqual([{ community: 'philly', added: 3, removed: 1 }])
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'old')
  })
})
