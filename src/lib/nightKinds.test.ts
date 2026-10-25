import { describe, expect, it } from 'vitest'
import { countGoogleKinds, countWatchKinds, kindBad, lastNightLine, nightKindOf, nightKinds, type GoogleLive, type NightKindView } from './nightKinds'
import type { JobRun } from './jobRuns'
import type { Watch } from './watches'

// Oct 25, 10 AM in Philadelphia: Google ran at 2, the watches at 3.
const NOW = Date.parse('2026-10-25T14:00:00Z')
const GOOGLE_AT = '2026-10-25T06:00:00.000Z'
const WATCHES_AT = '2026-10-25T07:00:00.000Z'
const night = (iso: string, days: number) => new Date(Date.parse(iso) - days * 86_400_000).toISOString()
const after = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString()

function watch(over: Partial<Watch>): Watch {
  return {
    id: 'w',
    communityId: 'philly',
    kind: 'website',
    url: 'https://example.org/',
    resourceId: null,
    label: null,
    active: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    createdBy: 'admin@example.org',
    lastRunAt: after(WATCHES_AT, 1),
    lastOkAt: after(WATCHES_AT, 1),
    lastError: null,
    failingSince: null,
    lastFiled: null,
    pageHash: 'h',
    pageChangedAt: null,
    lastCheck: null,
    ...over,
  }
}

function run(over: Partial<JobRun>): JobRun {
  const startedAt = over.startedAt ?? WATCHES_AT
  return { id: startedAt, job: 'watches', startedAt, finishedAt: after(startedAt, 4), ok: true, summary: '', warning: null, error: null, kinds: null, ...over }
}

const eruv = (id: string, over: Partial<Watch> = {}) => watch({ id, label: `${id} Eruv`, createdBy: 'eruv website', ...over })
const never = { lastRunAt: null, lastOkAt: null }

function kind(views: NightKindView[], name: string): NightKindView {
  return views.find((v) => v.name === name)!
}

describe('each watch’s kind of source', () => {
  it('as the tab has them', () => {
    expect(nightKindOf(watch({ kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments' }))).toBe('kosher')
    expect(nightKindOf(watch({ url: 'https://www.mekorhabracha.org/center-city/' }))).toBe('kosher')
    expect(nightKindOf(watch({ url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5' }))).toBe('hospitals')
    expect(nightKindOf(watch({ createdBy: 'eruv website', url: 'https://eruv.example/' }))).toBe('eruvs')
    expect(nightKindOf(watch({ createdBy: 'listing pages', resourceId: 's1', label: 'Beth Am · davening times on their website' }))).toBe('times')
    expect(nightKindOf(watch({ createdBy: 'menu links', resourceId: 'f1' }))).toBe('menus')
    expect(nightKindOf(watch({ createdBy: 'listing pages', resourceId: 'm1', label: 'Mikvah Ohr · hours on their website' }))).toBe('hours')
  })

  // Oct 25: Mikvah Moishe Zvi's page, found as "its website", was counted
  // as Minyan times; the watch list goes by its listing's category.
  it('a listing’s page by its category, whatever its label says', () => {
    const found = watch({ createdBy: 'listing pages (found)', resourceId: 'm1', label: 'Mikvah Moishe Zvi · its website' })
    expect(nightKindOf(found, (id) => (id === 'm1' ? 'hours' : null))).toBe('hours')
    expect(nightKindOf({ ...found, resourceId: 's1', label: 'Beth Am · its website' }, (id) => (id === 's1' ? 'times' : null))).toBe('times')
  })

  // Oct 25 (the user): the line is mikvah hours only.
  it('a page added by hand for no shul or mikvah isn’t counted', () => {
    expect(nightKindOf(watch({ url: 'https://bzbi.org/worship' }))).toBeNull()
  })

  // Read as each email comes in, not at night.
  it('a newsletter has none', () => {
    expect(nightKindOf(watch({ url: 'mailto:info@lms.org', createdBy: 'shul newsletters' }))).toBeNull()
    expect(nightKindOf(watch({ url: 'mailto:no-reply@x.com', createdBy: 'shul newsletters: not a shul' }))).toBeNull()
  })
})

describe('what a run saves', () => {
  it('the watches run: per community and kind, how many it had and read', () => {
    const queue = [
      eruv('a'),
      eruv('b'),
      watch({ id: 'm', createdBy: 'menu links', communityId: 'ues' }),
      watch({ id: 'n', url: 'mailto:info@lms.org', createdBy: 'shul newsletters' }),
    ]
    expect(countWatchKinds(queue, new Set(['a', 'm', 'n']))).toEqual({ philly: { eruvs: { of: 2, read: 1 } }, ues: { menus: { of: 1, read: 1 } } })
  })

  it('Google’s: every listing it asked about', () => {
    expect(countGoogleKinds([{ community: 'philly', ok: true }, { community: 'philly', ok: false }, { community: 'ues', ok: true }])).toEqual({
      philly: { google: { of: 2, read: 1 } },
      ues: { google: { of: 1, read: 1 } },
    })
  })
})

describe('last night, a line per kind', () => {
  const google: GoogleLive[] = [
    { name: 'Kosher Corner', matched: true, failedAt: null },
    { name: 'Hot Bagels', matched: true, failedAt: null },
    { name: 'Not matched', matched: false, failedAt: null },
  ]
  const runs = { 'sync-hours': [run({ job: 'sync-hours', startedAt: GOOGLE_AT })], watches: [run({})] }

  it('every kind, in order, with its run’s time', () => {
    const views = nightKinds('philly', runs, [], google, NOW)
    expect(views.map((v) => v.name)).toEqual(['Google', 'Kosher certification', 'Hospitals', 'Eruvs', 'Minyan times', 'Mikvah hours', 'Menus'])
    expect(views.map((v) => v.when)).toEqual(['2:00 AM', '3:00 AM', '3:00 AM', '3:00 AM', '3:00 AM', '3:00 AM', '3:00 AM'])
  })

  // FinalNightly's Eruvs.
  it('what wasn’t read, and why', () => {
    const watches = [eruv('Lower Merion', never), eruv('Northeast', never), eruv('Elkins Park', { lastRunAt: after(WATCHES_AT, 2), lastOkAt: night(WATCHES_AT, 3), lastError: 'The page answered 500' }), eruv('Center City')]
    const view = kind(nightKinds('philly', runs, watches, google, NOW), 'Eruvs')
    expect(view.count).toBe('1 of 4 read')
    expect(view.trouble).toBe('1 didn’t load · 2 never read')
    expect(view.misses).toEqual([
      { name: 'Lower Merion Eruv', why: 'Never read', page: 'eruv' },
      { name: 'Northeast Eruv', why: 'Never read', page: 'eruv' },
      { name: 'Elkins Park Eruv', why: 'Didn’t load', page: 'eruv' },
    ])
  })

  it('a run that ran out of time says so', () => {
    const shul = (id: string, over: Partial<Watch> = {}) => watch({ id, createdBy: 'listing pages', resourceId: id, label: `${id} · davening times on their website`, ...over })
    const watches = [shul('Beth Am'), shul('BZBI', { lastRunAt: night(WATCHES_AT, 1), lastOkAt: night(WATCHES_AT, 1) })]
    const view = kind(nightKinds('philly', { ...runs, watches: [run({ warning: 'Ran out of time: 1 left for the next night' })] }, watches, google, NOW), 'Minyan times')
    expect(view.count).toBe('1 of 2 read')
    expect(view.trouble).toBe('ran out of time')
    expect(view.misses).toEqual([{ name: 'BZBI', why: 'Not reached', page: 'times' }])
  })

  // Added after the run started, or paused: not last night's to read.
  it('counts only what the run could have read', () => {
    const watches = [eruv('a'), eruv('new', { ...never, createdAt: after(WATCHES_AT, 60) }), eruv('paused', { ...never, active: false })]
    expect(kind(nightKinds('philly', runs, watches, google, NOW), 'Eruvs')).toMatchObject({ count: '1 of 1 read', trouble: null, misses: [] })
  })

  it('a place’s pages missed for the same reason are one line', () => {
    const page = (id: string, over: Partial<Watch> = {}) => watch({ id, createdBy: 'listing pages', resourceId: 's1', label: 'Sons of Israel · davening times on their website', lastOkAt: night(WATCHES_AT, 1), ...over })
    const watches = [page('a'), page('b'), page('c', never)]
    expect(kind(nightKinds('philly', runs, watches, google, NOW), 'Minyan times').misses).toEqual([
      { name: 'Sons of Israel · 2 pages', why: 'Didn’t load', page: 'times' },
      { name: 'Sons of Israel', why: 'Never read', page: 'times' },
    ])
  })

  // As the watches are labelled (Oct 25, dev).
  it('each missed by its place’s name', () => {
    const watches = [
      watch({ id: 'h', url: 'https://refuah.com/hospitals/jx77h9d00qztqgbbe8e0rfj1r589mgf5', label: 'Pennsylvania Hospital on Refuah', ...never }),
      eruv('e', { label: 'Center City Eruv’s website', ...never }),
      watch({ id: 'k', kind: 'keystone_list', url: 'https://www.keystone-k.org/establishments', label: 'Keystone-K\'s list', ...never }),
    ]
    const names = (k: string) => kind(nightKinds('philly', runs, watches, google, NOW), k).misses.map((m) => m.name)
    expect([...names('Hospitals'), ...names('Eruvs'), ...names('Kosher certification')]).toEqual(['Pennsylvania Hospital', 'Center City Eruv', 'Keystone-K\'s list'])
  })

  it('a mikvah’s page of hours links to the hours page', () => {
    const watches = [
      watch({ createdBy: 'listing pages', resourceId: 'm1', label: 'Mikvah Ohr · hours on their website', ...never }),
      watch({ id: 'z', createdBy: 'listing pages (found)', resourceId: 'm2', label: 'Mikvah Moishe Zvi · its website', ...never }),
      watch({ id: 'x', label: 'A page', ...never }),
    ]
    const readsOf = (id: string) => (id.startsWith('m') ? ('hours' as const) : null)
    const views = nightKinds('philly', runs, watches, google, NOW, [], readsOf)
    expect(kind(views, 'Mikvah hours').misses).toEqual([
      { name: 'Mikvah Ohr', why: 'Never read', page: 'hours' },
      { name: 'Mikvah Moishe Zvi', why: 'Never read', page: 'hours' },
    ])
    expect(kind(views, 'Minyan times').misses).toEqual([])
  })

  it('Google: every matched place, and any it couldn’t ask about', () => {
    expect(kind(nightKinds('philly', runs, [], google, NOW), 'Google')).toMatchObject({ count: '2 places read', trouble: null, misses: [] })
    const failing = [...google, { name: 'Closed Deli', matched: true, failedAt: after(GOOGLE_AT, 1) }]
    expect(kind(nightKinds('philly', runs, [], failing, NOW), 'Google')).toMatchObject({
      count: '2 of 3 places read',
      trouble: '1 didn’t load',
      misses: [{ name: 'Closed Deli', why: 'Didn’t load', page: 'google' }],
    })
  })

  it('a kind with nothing to read', () => {
    expect(kind(nightKinds('philly', runs, [], google, NOW), 'Hospitals')).toMatchObject({ count: 'Nothing to read', trouble: null })
  })

  it('a run that didn’t run, failed, was cut off or hasn’t run yet', () => {
    const late = kind(nightKinds('philly', { watches: [run({ startedAt: night(WATCHES_AT, 3) })] }, [], google, NOW), 'Eruvs')
    expect(late.count).toBe('Didn’t run since Oct 22')
    expect(kindBad(late)).toBe(true)
    expect(kind(nightKinds('philly', { watches: [run({ ok: false, error: 'boom' })] }, [], google, NOW), 'Menus')).toMatchObject({ count: 'Failed', trouble: 'boom' })
    const cutOff = kind(nightKinds('philly', { watches: [run({ finishedAt: null, ok: null })] }, [eruv('a'), eruv('b', never)], google, NOW), 'Eruvs')
    expect(cutOff).toMatchObject({ count: '1 of 2 read', trouble: 'stopped before it finished · 1 never read' })
    expect(kind(nightKinds('philly', {}, [], google, NOW), 'Google')).toMatchObject({ when: null, count: 'Not run yet', nights: [] })
  })
})

// Oct 25: the read-menus job, which reads a few menus never read each
// night, folded into Menus.
describe('Menus, with the menus never read', () => {
  const runs = { watches: [run({})], 'read-menus': [run({ job: 'read-menus', startedAt: after(WATCHES_AT, 30) })] }
  const menu = (id: string, resourceId: string, over: Partial<Watch> = {}) => watch({ id, createdBy: 'menu links', resourceId, label: `Menu · ${id}`, ...over })

  it('a place never read is Never read, by its name, whether its menu’s watch loaded or not', () => {
    const watches = [menu('Zevi’s', 'f1'), menu('Zevi’s 2', 'f1'), menu('Judah', 'f2'), menu('Yum', 'f3', { lastRunAt: after(WATCHES_AT, 2), lastOkAt: night(WATCHES_AT, 1) })]
    const unread = [{ id: 'f1', name: 'Zevi’s Pizza' }, { id: 'f9', name: 'Bar Bombon' }]
    const view = kind(nightKinds('philly', runs, watches, [], NOW, unread), 'Menus')
    expect(view.count).toBe('1 of 4 read')
    expect(view.trouble).toBe('1 didn’t load · 2 never read')
    expect(view.misses).toEqual([
      { name: 'Zevi’s Pizza', why: 'Never read', page: 'dishes' },
      { name: 'Yum', why: 'Didn’t load', page: 'dishes' },
      { name: 'Bar Bombon', why: 'Never read', page: 'dishes' },
    ])
  })

  it('says when reading new menus failed, didn’t run or isn’t set up', () => {
    const menus = (r: Partial<JobRun>) => kind(nightKinds('philly', { ...runs, 'read-menus': [run({ job: 'read-menus', startedAt: after(WATCHES_AT, 30), ...r })] }, [], [], NOW), 'Menus').trouble
    expect(menus({ ok: false, error: 'boom' })).toBe('reading new menus failed')
    expect(menus({ startedAt: night(WATCHES_AT, 3) })).toBe('reading new menus didn’t run since Oct 22')
    expect(menus({ warning: 'Not set up: no OPENAI_API_KEY' })).toBe('reading new menus isn’t set up')
    expect(menus({})).toBeNull()
  })

  it('a night’s new menus read, after its count', () => {
    const watches = [run({ kinds: { philly: { menus: { of: 51, read: 42 } } } }), run({ startedAt: night(WATCHES_AT, 1), kinds: { philly: { menus: { of: 51, read: 51 } } } })]
    const firstReads = [run({ job: 'read-menus', startedAt: after(WATCHES_AT, 30), kinds: { philly: { menus: { of: 23, read: 3 } } } }), run({ job: 'read-menus', startedAt: night(after(WATCHES_AT, 30), 1), kinds: { philly: { menus: { of: 20, read: 0 } } } })]
    expect(kind(nightKinds('philly', { watches, 'read-menus': firstReads }, [], [], NOW), 'Menus').nights).toEqual([
      { date: 'Oct 25', result: '42 of 51 read · 3 new menus read', tone: 'bad' },
      { date: 'Oct 24', result: '51 of 51 read', tone: 'good' },
    ])
  })
})

describe('a kind’s last 14 nights', () => {
  const counted = (days: number, of: number, read: number) => run({ startedAt: night(WATCHES_AT, days), kinds: { philly: { eruvs: { of, read } }, ues: { eruvs: { of: 9, read: 9 } } } })

  it('each night’s count, newest first, a night with no run as Didn’t run', () => {
    const runs = [counted(0, 5, 1), counted(1, 5, 5), run({ startedAt: night(WATCHES_AT, 3), finishedAt: null, ok: null }), run({ startedAt: night(WATCHES_AT, 4), ok: false }), run({ startedAt: night(WATCHES_AT, 5) })]
    expect(kind(nightKinds('philly', { watches: runs }, [], [], NOW), 'Eruvs').nights).toEqual([
      { date: 'Oct 25', result: '1 of 5 read', tone: 'bad' },
      { date: 'Oct 24', result: '5 of 5 read', tone: 'good' },
      { date: 'Oct 23', result: 'Didn’t run', tone: 'bad' },
      { date: 'Oct 22', result: 'Started, didn’t finish', tone: 'bad' },
      { date: 'Oct 21', result: 'Failed', tone: 'bad' },
      // From before migration 087.
      { date: 'Oct 20', result: 'Not counted', tone: 'none' },
    ])
  })

  it('this community’s count alone', () => {
    expect(kind(nightKinds('ues', { watches: [counted(0, 5, 1)] }, [], [], NOW), 'Eruvs').nights).toEqual([{ date: 'Oct 25', result: '9 of 9 read', tone: 'good' }])
  })

  // At 1 AM tonight's run is still to come.
  it('no line for today before it has run', () => {
    const early = Date.parse('2026-10-26T05:00:00Z')
    expect(kind(nightKinds('philly', { watches: [counted(0, 5, 5)] }, [], [], early), 'Eruvs').nights.map((n) => n.date)).toEqual(['Oct 25'])
  })

  it('Google’s, when it read every place', () => {
    const google = run({ job: 'sync-hours', startedAt: GOOGLE_AT, kinds: { philly: { google: { of: 140, read: 140 } } } })
    expect(kind(nightKinds('philly', { 'sync-hours': [google] }, [], [], NOW), 'Google').nights).toEqual([{ date: 'Oct 25', result: '140 read', tone: 'good' }])
  })

  it('fourteen at most', () => {
    const runs = Array.from({ length: 20 }, (_, i) => counted(i, 5, 5))
    expect(kind(nightKinds('philly', { watches: runs }, [], [], NOW), 'Eruvs').nights).toHaveLength(14)
  })
})

describe('the closed row', () => {
  const view = (name: string, count: string, trouble: string | null = null) => ({ name, count, trouble })

  it('everything read', () => {
    expect(lastNightLine([view('Google', '140 places read'), view('Hospitals', '7 of 7 read')])).toEqual({ good: true, text: 'Everything read' })
  })

  // FinalNightly's Oct 24.
  it('which kinds weren’t all read', () => {
    const kinds = [view('Google', '140 places read'), view('Eruvs', '1 of 5 read', '4 never read'), view('Minyan times', '12 of 28 read', 'ran out of time'), view('Mikvah hours', 'Didn’t run since Oct 22'), view('Menus', 'Failed', 'boom')]
    expect(lastNightLine(kinds)).toEqual({ good: false, text: 'Eruvs, minyan times, mikvah hours and menus not all read' })
  })
})
