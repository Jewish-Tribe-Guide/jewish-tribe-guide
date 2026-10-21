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
  looksLikeHours,
  timesPagesToRead,
  PAGE_STOPPED_CREATOR,
  sourceLine,
} from './hoursJob'
import { LISTING_PAGE_WATCH_CREATOR } from './listingPageWatch'
import type { Watch, WatchCheck } from './watches'

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
    expect(looksLikeHours({ text: 'On Shabbos, by appointment only, one hour after candle-lighting time.', pdf: null })).toBe(false)
    expect(looksLikeHours({ text: null, pdf: 'JVBERi0' })).toBe(true)
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
    // Not filed, for a suggestion already waiting in the queue: still to check.
    expect(at([filed('waiting')], 0)).toBe('to_check')
    expect(at([watch({ lastCheck: check('unsure') })], 0)).toBe('to_check')
    // Not known what waits: as before.
    expect(s([filed('before')])).toBe('to_check')
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
