import { describe, expect, it } from 'vitest'
import {
  HOURS_FOUND_CREATOR,
  HOURS_OFF_CREATOR,
  foundPageLabel,
  hoursCounts,
  hoursJobCategories,
  hoursJobName,
  hoursOffUrl,
  hoursSection,
  hoursWatchChanges,
  homePageReads,
  homePageWatchChanges,
  looksLikeHours,
  ownSiteCategories,
  siteGap,
  timesPagesToRead,
  PAGE_STOPPED_CREATOR,
  sourceLine,
} from './hoursJob'
import { LISTING_PAGE_WATCH_CREATOR } from './listingPageWatch'
import type { Watch, WatchCheck } from './watches'
import type { CategoryConfig } from './categories'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const check = (result: WatchCheck['result']): WatchCheck => ({ at: ago(2), what: 'hours', from: null, result, read: [], differences: [], queue: null })
const watch = (over: Partial<Watch>): Watch =>
  ({ id: 'w', communityId: 'philly', kind: 'website', url: 'https://lmcmikvah.org/', resourceId: 'lmc', label: null, active: true, createdBy: HOURS_FOUND_CREATOR, lastRunAt: ago(2), lastOkAt: ago(2), lastError: null, failingSince: null, lastCheck: check('agrees'), ...over }) as Watch

describe('looksLikeHours', () => {
  it('is a page with a clock time on it (the Oct 21 dry run’s pages, all four mikvahs)', () => {
    expect(looksLikeHours({ text: 'The mikvah will be open from 7:30PM – 9:30PM every weeknight.', pdf: null })).toBe(true)
    expect(looksLikeHours({ text: 'Sunday – Thursday: 4:30 AM – 10 AM', pdf: null })).toBe(true)
    expect(looksLikeHours({ text: 'Open 10 a.m. to noon', pdf: null })).toBe(true)
    // Read for hours by the AI, rightly, as none.
    expect(looksLikeHours({ text: 'The kelim mikvah closes at sunset', pdf: null })).toBe(false)
    expect(looksLikeHours({ text: 'The cost is $18 and 48 hours notice is required.', pdf: null })).toBe(false)
    expect(looksLikeHours({ text: null, pdf: 'JVBERi0' })).toBe(true)
  })

  it('is a page that books by appointment: its note is all it says of its hours (Mei Shalva, Oct 22)', () => {
    expect(looksLikeHours({ text: 'Schedule your appointment (48 hours advance notice would be appreciated)', pdf: null })).toBe(true)
    expect(looksLikeHours({ text: 'On Shabbos, by appointment only, one hour after candle-lighting time.', pdf: null })).toBe(true)
  })
})

describe('timesPagesToRead', () => {
  const page = (text: string, weeks?: string[][]) => ({ text, pdf: null, weeks: weeks?.map((lines) => ({ lines })) })

  // Oct 21's read-only check of every shul page, as each page read.
  it('reads a shul’s page with a davening time, not a museum’s hours or a footer’s office hours', () => {
    const rosenbach = page('Hours\nThursday: 10:30am — 6:00pm\nSunday: 10:30am — 4:30pm\nGuided tours are offered every Thursday through Sunday at 10:30am.')
    const officeFooter = page('About our congregation\nOffice Hours\n9 AM - 5 PM\n9 AM - 3 PM')
    const mikvehIsrael = page('Shacharit\n7:15 AM (In synagogue)\nFriday Night Services 6:00PM\nOffice Hours\n9 AM - 5 PM')
    expect(timesPagesToRead([rosenbach, officeFooter, mikvehIsrael, null, { text: null, pdf: 'JVBERi0' }])).toEqual([false, false, true, false, true])
  })

  it('reads a calendar every page shows once, from the page whose own words give the most times', () => {
    const week = ['2026-10-22 (Thu) 7:45 AM: Monday & Thursday Morning Minyan', '2026-10-24 (Sat) 9:30 AM: Shabbat Services']
    const text = (own: string) => [...week, '', own].join('\n')
    const home = page(text('Welcome to BZBI'), [week])
    const worship = page(text('Weekday Minyan\nMonday–Friday 7:45 AM\nShabbat Services 9:30 AM'), [week])
    const sermons = page(text('Rosh Hashanah sermon'), [week])
    const other = page(['2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service'].join('\n'), [['2026-10-23 (Fri) 6:00 PM: Shabbat Evening Service']])
    expect(timesPagesToRead([home, worship, sermons, other])).toEqual([false, true, false, true])
    // None says more than the calendar: the first, the home page.
    expect(timesPagesToRead([home, sermons])).toEqual([true, false])
  })

  it('reads a calendar posted as pictures, as a PDF is, and once however many pages show it', () => {
    // Mikveh Israel's calendar page: an empty event list and a footer's
    // office hours in its words, the month in a picture.
    const pictured = (words: string) => ({ ...page(words), pictures: ['https://cdn.example/Oct+calendar+2026.png'] })
    const calendar = pictured('No results found\nOffice Hours\n9 AM - 5 PM')
    expect(timesPagesToRead([calendar, page('Office Hours\n9 AM - 5 PM')])).toEqual([true, false])
    expect(timesPagesToRead([calendar, pictured('Visit us\nOffice Hours\n9 AM - 5 PM')])).toEqual([true, false])
  })
})

describe('hoursJobCategories', () => {
  const field = (key: string, type = 'hours') => ({ key, label: key, type }) as never
  it('is a category with named weekly hours, not one with only Google’s plain Hours', () => {
    const mikvah = { id: 'mikvah', label: 'Mikvah', detailFields: [field('hours'), field('women_s_hours'), field('keilim_hours')] }
    const food = { id: 'food', label: 'Food', detailFields: [field('hours')] }
    const shul = { id: 'shul', label: 'Shul', detailFields: [field('minyanim', 'minyanim')] }
    expect(hoursJobCategories([mikvah, food, shul]).map((c) => c.id)).toEqual(['mikvah'])
    expect(hoursJobName([mikvah])).toBe('Mikvah hours')
    // Shuls (Oct 21): a category with davening times.
    expect(hoursJobCategories([mikvah, food, shul], 'times').map((c) => c.id)).toEqual(['shul'])
    expect(hoursJobName([shul], 'times')).toBe('Shul times')
  })
})

describe('sourceLine', () => {
  it('says where a source came from', () => {
    expect(sourceLine({ createdBy: HOURS_FOUND_CREATOR, label: foundPageLabel('LMC', null) })).toBe('Found from its website')
    expect(sourceLine({ createdBy: HOURS_FOUND_CREATOR, label: foundPageLabel('LMC', 'Men’s Mikvah') })).toBe('Found from its website’s Men’s Mikvah link')
    expect(sourceLine({ createdBy: LISTING_PAGE_WATCH_CREATOR, label: 'LMC · hours on their website' })).toBe('Added by hand')
  })
})

describe('hoursWatchChanges', () => {
  const place = { id: 'lmc', name: 'Lower Merion Community Mikvah' }
  const found = [
    { url: 'https://lmcmikvah.org/', link: null },
    { url: 'https://lmcmikvah.org/mens-mikvah/', link: 'Men’s Mikvah' },
  ]

  it('adds the pages it found that aren’t watched yet, by an admin or by itself', () => {
    // Live's was given as http://, and the search finds it as https://.
    const hand = watch({ id: 'hand', url: 'http://www.lmcmikvah.org', createdBy: LISTING_PAGE_WATCH_CREATOR })
    expect(hoursWatchChanges(place, { found, unloaded: [] }, [hand])).toEqual({
      add: [{ url: 'https://lmcmikvah.org/mens-mikvah/', label: 'Lower Merion Community Mikvah · Men’s Mikvah' }],
      remove: [],
    })
  })

  it('takes away its own pages it no longer finds, never one an admin gave, nor one that only didn’t load', () => {
    const gone = watch({ id: 'gone', url: 'https://lmcmikvah.org/old-hours/' })
    const slow = watch({ id: 'slow', url: 'https://lmcmikvah.org/keilim-mikvah/' })
    const hand = watch({ id: 'hand', url: 'https://lmcmikvah.org/given/', createdBy: LISTING_PAGE_WATCH_CREATOR })
    const other = watch({ id: 'other', url: 'https://philamikvah.org/', resourceId: 'mei' })
    const got = hoursWatchChanges(place, { found, unloaded: ['https://lmcmikvah.org/keilim-mikvah/'] }, [gone, slow, hand, other])
    expect(got.remove).toEqual(['gone'])
  })

  it('never adds again a page an admin stopped, nor takes it away', () => {
    const stopped = watch({ id: 'stopped', url: 'https://lmcmikvah.org/mens-mikvah/', createdBy: PAGE_STOPPED_CREATOR, active: false })
    const home = watch({ id: 'home', url: 'https://lmcmikvah.org/' })
    expect(hoursWatchChanges(place, { found: found.slice(0, 1), unloaded: [] }, [home, stopped])).toEqual({ add: [], remove: [] })
    expect(hoursWatchChanges(place, { found, unloaded: [] }, [home, stopped])).toEqual({ add: [], remove: [] })
    expect(sourceLine(stopped)).toBe('Stopped')
  })

  it('changes nothing when the website didn’t open, or the place is off', () => {
    const own = watch({ id: 'own', url: 'https://lmcmikvah.org/old/' })
    expect(hoursWatchChanges(place, null, [own])).toEqual({ add: [], remove: [] })
    const off = watch({ id: 'off', url: hoursOffUrl('lmc'), createdBy: HOURS_OFF_CREATOR, active: false })
    expect(hoursWatchChanges(place, { found, unloaded: [] }, [own, off])).toEqual({ add: [], remove: [] })
  })
})

// Oct 25 (the user): "read phone, email and hours from the website for
// the other kinds of place too, only where Google doesn't have them".
describe('the kinds of place whose own websites are read', () => {
  const hours = { key: 'hours', label: 'Hours', type: 'hours' } as CategoryConfig['detailFields'][number]
  const kinds = [
    { id: 'restaurant', hasPhone: true, detailFields: [hours] },
    { id: 'grocery', hasPhone: true, detailFields: [hours] },
    { id: 'hotel', hasPhone: true, detailFields: [] },
    { id: 'cemetery', hasPhone: false, detailFields: [] },
    { id: 'synagogue', hasPhone: true, detailFields: [{ key: 'minyanim', label: 'Minyanim', type: 'minyanim' }] },
    { id: 'mikvah', hasPhone: true, detailFields: [hours, { key: 'women_s_hours', label: 'Women’s Hours', type: 'hours' }] },
    { id: 'hospital', hasPhone: true, detailFields: [hours] },
    { id: 'zmanim', kind: 'zmanim', hasPhone: true, detailFields: [] },
  ].map((c) => ({ kind: 'listing', ...c })) as Pick<CategoryConfig, 'id' | 'kind' | 'hasPhone' | 'detailFields'>[]

  it('every kind with a phone, an email or hours, but those a job of their own reads', () => {
    expect(ownSiteCategories(kinds).map((c) => c.id)).toEqual(['restaurant', 'grocery', 'hotel'])
  })
})

describe('a food place’s home page (Main dishes board 3)', () => {
  const food = { hasPhone: true, detailFields: [{ key: 'hours', label: 'Hours', type: 'hours' }, { key: 'dishes', label: 'Main dishes', type: 'tags' }] as CategoryConfig['detailFields'] }
  // Chalavita on live: no Google match, so its hours and phone are its website's.
  const chalavita = { id: 'cv', name: 'Chalavita', website: 'chalavita.com', details: {} }

  it('is read for what Google doesn’t keep: its hours, its phone, both or neither', () => {
    expect(homePageReads(food, {})).toEqual(['hours', 'phone'])
    expect(homePageReads(food, { placeId: 'g', googleFields: ['hours'] })).toEqual(['phone'])
    expect(homePageReads(food, { placeId: 'g', googleFields: ['hours', 'phone'] })).toEqual([])
    expect(homePageReads({ hasPhone: false, detailFields: [] }, {})).toEqual([])
  })

  // Oct 25 (the user): phone, email and hours, for every kind of place.
  it('its email too, which is never Google’s, and a phone field of its own', () => {
    const office = { hasPhone: true, detailFields: [{ key: 'office_email', label: 'Email', type: 'text' }, { key: 'office_phone', label: 'Office phone', type: 'tel' }] as CategoryConfig['detailFields'] }
    expect(homePageReads(office, { placeId: 'g', googleFields: ['phone'] })).toEqual(['phone', 'email'])
    expect(homePageReads({ hasPhone: true, detailFields: office.detailFields.slice(0, 1) }, { placeId: 'g', googleFields: ['phone'] })).toEqual(['email'])
  })

  it('says why it’s read', () => {
    expect(siteGap(food, {})).toBe('Not on Google')
    expect(siteGap(food, { placeId: 'g', googleFields: ['phone'] })).toBe('Google has no hours')
    expect(siteGap(food, { placeId: 'g', googleFields: ['name'] })).toBe('Google has no hours or phone')
    expect(siteGap(food, { placeId: 'g', googleFields: ['hours', 'phone'] })).toBe('')
  })

  it('is watched once, as its website, unless another watch already reads that page', () => {
    expect(homePageWatchChanges(chalavita, food, [])).toEqual({ add: [{ url: 'https://chalavita.com/', label: 'Chalavita · its website' }], remove: [] })
    const menu = watch({ id: 'menu', url: 'https://www.chalavita.com', resourceId: 'cv', createdBy: 'menu links' })
    expect(homePageWatchChanges(chalavita, food, [menu])).toEqual({ add: [], remove: [] })
    expect(homePageWatchChanges({ ...chalavita, website: null }, food, [])).toEqual({ add: [], remove: [] })
  })

  it('goes once Google keeps both, or its website moves; an admin’s never does', () => {
    const own = watch({ id: 'own', url: 'https://chalavita.com/', resourceId: 'cv' })
    const hand = watch({ id: 'hand', url: 'https://chalavita.com/hours', resourceId: 'cv', createdBy: LISTING_PAGE_WATCH_CREATOR })
    const google = { ...chalavita, details: { placeId: 'g', googleFields: ['hours', 'phone'] } }
    expect(homePageWatchChanges(google, food, [own, hand])).toEqual({ add: [], remove: ['own'] })
    expect(homePageWatchChanges({ ...chalavita, website: 'chalavita.net' }, food, [own]).remove).toEqual(['own'])
    expect(homePageWatchChanges(chalavita, food, [own, hand])).toEqual({ add: [], remove: [] })
  })

  it('is left alone when the place is off', () => {
    const own = watch({ id: 'own', url: 'https://chalavita.com/', resourceId: 'cv' })
    const off = watch({ id: 'off', url: hoursOffUrl('cv'), resourceId: 'cv', createdBy: HOURS_OFF_CREATOR, active: false })
    expect(homePageWatchChanges({ ...chalavita, website: null }, food, [own, off])).toEqual({ add: [], remove: [] })
  })
})

describe('hoursSection', () => {
  const s = (pages: Watch[], off = false) => hoursSection({ pages, off }, NOW)
  it('puts a place where its pages’ last reads say', () => {
    expect(s([watch({ lastCheck: check('agrees') }), watch({ lastCheck: check('differs') })])).toBe('to_check')
    expect(s([watch({ lastCheck: check('unsure') })])).toBe('to_check')
    expect(s([watch({ lastCheck: check('agrees') }), watch({ lastCheck: null })])).toBe('waiting')
    expect(s([watch({ lastRunAt: null, lastCheck: null })])).toBe('waiting')
    expect(s([watch({ lastCheck: check('agrees') }), watch({ lastCheck: check('nothing') })])).toBe('checked')
    // Pages that give no weekly hours, or none to read.
    expect(s([watch({ lastCheck: check('nothing') })])).toBe('cant_read')
    expect(s([])).toBe('cant_read')
    // Pages found on its website, not watched yet: the morning's run reads them.
    expect(hoursSection({ pages: [], off: false, found: true }, NOW)).toBe('waiting')
    // A page that didn't load this morning doesn't hide what the others read.
    expect(s([watch({ failingSince: ago(1), lastError: 'HTTP 500' }), watch({ lastCheck: check('agrees') })])).toBe('checked')
    expect(s([watch({ failingSince: ago(1), lastError: 'HTTP 500' })])).toBe('cant_read')
    expect(s([watch({})], true)).toBe('off')
    expect(s([watch({ active: false })])).toBe('off')
  })

  // Step 6: a finding waits on the job page, and Update or Skip settles it.
  it('a waiting finding is to check; a page that differs only by one decided is checked', () => {
    const filed = (queue: WatchCheck['queue']) => watch({ lastCheck: { ...check('differs'), queue } })
    const at = (pages: Watch[], waiting: number) => hoursSection({ pages, off: false, waiting }, NOW)
    expect(at([filed('filed')], 1)).toBe('to_check')
    // A newsletter's finding, with its page agreeing.
    expect(at([watch({ lastCheck: check('agrees') })], 1)).toBe('to_check')
    expect(at([filed('filed')], 0)).toBe('checked')
    expect(at([filed('before')], 0)).toBe('checked')
    // Not filed, for a suggestion already waiting in the queue: still to
    // check, until a finding is decided after it, the one it waited behind
    // (Sons of Israel's home page, Oct 22: "In the queue", nothing to open).
    expect(at([filed('waiting')], 0)).toBe('to_check')
    const decided = (decidedAt: string, waiting = 0) => hoursSection({ pages: [filed('waiting')], off: false, waiting, decidedAt }, NOW)
    expect(decided(new Date(NOW).toISOString())).toBe('checked')
    expect(decided(new Date(NOW - 3 * 86_400_000).toISOString())).toBe('to_check')
    expect(decided(new Date(NOW).toISOString(), 1)).toBe('to_check')
    expect(at([watch({ lastCheck: check('unsure') })], 0)).toBe('to_check')
    // Not known what waits: as before.
    expect(s([filed('before')])).toBe('to_check')
  })

  // The user, Oct 22: a shul's newsletter is one of its reads, not a watch
  // apart. BZBI's website turns the reader away; its newsletter is read.
  it('a shul read from its newsletter is checked, not can’t be read', () => {
    const news = (over: Partial<Watch> = {}) => watch({ id: 'nl', url: 'mailto:communications@bzbi.org', createdBy: 'shul newsletters', lastCheck: null, pageChangedAt: ago(30), ...over })
    const at = (pages: Watch[], newsletters: Watch[], waiting = 0) => hoursSection({ pages, off: false, waiting, newsletters }, NOW)
    expect(at([], [news()])).toBe('checked')
    expect(at([watch({ lastCheck: check('unreadable') })], [news()])).toBe('checked')
    expect(at([watch({ failingSince: ago(1), lastError: 'HTTP 403' })], [news()])).toBe('checked')
    // Its finding waits: to check, as a page's does.
    expect(at([], [news()], 1)).toBe('to_check')
    // No email yet, gone quiet, or paused: not a read.
    expect(at([], [news({ pageChangedAt: null })])).toBe('cant_read')
    expect(at([], [news({ failingSince: ago(1), lastError: 'No newsletter from them since Sep 1' })])).toBe('cant_read')
    expect(at([], [news({ active: false })])).toBe('cant_read')
    // A page that differs, waiting behind a suggestion, is still to check.
    expect(at([watch({ lastCheck: { ...check('differs'), queue: 'waiting' } })], [news()])).toBe('to_check')
  })

  it('counts them for the Watches tab’s row', () => {
    const places = [
      { pages: [watch({ lastCheck: check('differs') }), watch({ failingSince: ago(1), lastError: 'HTTP 500' })], off: false },
      { pages: [], off: false },
      { pages: [watch({})], off: false },
      { pages: [], off: true },
    ]
    expect(hoursCounts(places, NOW)).toEqual({ checked: 1, toCheck: 1, cantRead: 1, didntLoad: 1, waiting: 0, off: 1 })
  })
})
