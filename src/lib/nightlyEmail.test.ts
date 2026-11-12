import { describe, expect, it } from 'vitest'
import type { Finding, FindingLine } from './watchFindings'
import type { SpecialSchedule } from './schedules'
import type { StatusChange } from './email'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { NEWSLETTER_WATCH_NAME } from './newsletter'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import {
  buildNightlyEmail,
  findingWhat,
  googleChanges,
  googleLine,
  nightName,
  nightSentence,
  nightSubject,
  waitingRow,
  weekName,
  type Night,
  type WaitingRow,
} from './nightlyEmail'

// The nightly email as drawn (canvas S7uB4KuZQtdF6bJywzUZBd, N7 busy,
// N8 quiet, N9 the same on a computer).

// Sent Friday Nov 13, 4:45am in Philadelphia: Thursday night.
const AT = new Date('2026-11-13T09:45:00Z')
const TODAY = '2026-11-13'
const PHILLY = { slug: 'philly', name: 'Philly Jewish Guide', shortName: 'Philly' }

const line = (label: string, key = label.toLowerCase()): FindingLine => ({ key, label, before: 'a', after: 'b', choosable: true })
const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 's1',
  operation: 'update',
  targetId: 'p1',
  name: 'Kol Tzedek',
  from: 'its website',
  says: 'Its page says',
  named: null,
  at: '2026-11-13T07:10:00Z',
  notes: [],
  lines: [],
  ...over,
})

const week = (from: string, to: string, minyanim: SpecialSchedule['minyanim'], id = `w-${from}`): SpecialSchedule => ({ id, name: 'This week', from, to, mode: 'replace', minyanim, kind: 'week' })
const m = (on: string, tefillah: string, time: string, notes?: string) => ({ id: `${on}-${tefillah}`, tefillah, on: [on], time, ...(notes ? { notes } : {}) }) as SpecialSchedule['minyanim'][number]

const weekFinding = (current: SpecialSchedule[], proposed: SpecialSchedule[]): Finding =>
  finding({
    part: 'week',
    lines: [line('Minyanim', 'minyanim_schedules')],
    times: { field: { key: 'minyanim', label: 'Minyanim', type: 'minyanim' } as never, current: [], proposed: [], currentSchedules: current, proposedSchedules: proposed },
  })

describe('a place’s row', () => {
  it('this week’s times, with how many changed', () => {
    const was = week('2026-11-08', '2026-11-14', [m('2026-11-13', 'mincha', '4:15pm'), m('2026-11-14', 'shacharis', '9:00am')])
    const now = week('2026-11-08', '2026-11-14', [m('2026-11-13', 'mincha', '4:20pm'), m('2026-11-14', 'shacharis', '9:00am')])
    expect(findingWhat(weekFinding([was], [now]), TODAY)).toEqual({ kind: 'times', what: 'This week’s times, 1 change' })
    const two = week('2026-11-08', '2026-11-14', [m('2026-11-13', 'mincha', '4:20pm'), m('2026-11-14', 'shacharis', '8:45am')])
    expect(findingWhat(weekFinding([was], [two]), TODAY).what).toBe('This week’s times, 2 changes')
  })

  it('a week the listing hasn’t got yet: the week alone', () => {
    const next = week('2026-11-15', '2026-11-21', [m('2026-11-20', 'mincha', '4:15pm')])
    expect(findingWhat(weekFinding([], [next]), TODAY).what).toBe('Next week’s times')
  })

  it('only a note: “A note changed”, a minyan time change all the same', () => {
    const was = week('2026-11-08', '2026-11-14', [m('2026-11-14', 'shacharis', '9:00am')])
    const now = week('2026-11-08', '2026-11-14', [m('2026-11-14', 'shacharis', '9:00am', 'Kiddush after')])
    expect(findingWhat(weekFinding([was], [now]), TODAY)).toEqual({ kind: 'times', what: 'A note changed' })
  })

  it('a usual part by its name', () => {
    expect(findingWhat(finding({ part: 'weekday', lines: [line('Minyanim')] }), TODAY).what).toBe('Usual weekday times')
  })

  it('a kosher certificate; hours; a new place; a closure', () => {
    expect(findingWhat(finding({ lines: [line('Hechsher')] }), TODAY)).toEqual({ kind: 'kosher', what: 'Kosher certificate' })
    expect(findingWhat(finding({ lines: [line('Hours', 'hours')] }), TODAY, new Set(['hours']))).toEqual({ kind: 'hours', what: 'Hours' })
    expect(findingWhat(finding({ operation: 'create' }), TODAY)).toEqual({ kind: 'new', what: 'A new place' })
    expect(findingWhat(finding({ operation: 'delete' }), TODAY)).toEqual({ kind: 'closed', what: 'Closed for good' })
  })

  it('anything else by its fields, the first and how many more', () => {
    expect(findingWhat(finding({ lines: [line('Phone'), line('Website'), line('Email')] }), TODAY)).toEqual({ kind: 'other', what: 'Phone and 2 more' })
  })

  it('says where it was read', () => {
    const row = (watchName: string) => waitingRow([{ finding: finding({ lines: [line('Hechsher')] }), watchName }], { today: TODAY, path: '/p' })
    expect(row(LISTING_PAGE_WATCH_NAME).from).toBe('From their website')
    expect(row(NEWSLETTER_WATCH_NAME).from).toBe('From their newsletter')
    expect(row(KEYSTONE_WATCH_NAME).from).toBe('From Keystone-K’s list')
  })

  it('a place’s findings together, as one row', () => {
    const row = waitingRow(
      [
        { finding: finding({ part: 'weekday', lines: [line('Minyanim')] }), watchName: LISTING_PAGE_WATCH_NAME },
        { finding: finding({ part: 'shabbos', lines: [line('Minyanim')] }), watchName: LISTING_PAGE_WATCH_NAME },
      ],
      { today: TODAY, path: '/philly/admin/watches/place/p1?from=todo' },
    )
    expect(row).toMatchObject({ name: 'Kol Tzedek', what: 'Usual weekday times · Usual Shabbos times', kind: 'times', path: '/philly/admin/watches/place/p1?from=todo' })
  })
})

describe('weeks by where they fall', () => {
  it('this week, next week, or by date', () => {
    expect(weekName({ from: '2026-11-08', to: '2026-11-14' }, TODAY)).toBe('This week’s times')
    expect(weekName({ from: '2026-11-15', to: '2026-11-21' }, TODAY)).toBe('Next week’s times')
    expect(weekName({ from: '2026-11-29', to: '2026-12-05' }, TODAY)).toBe('Times for Nov 29')
  })
})

const row = (name: string, kind: WaitingRow['kind'], what = 'x'): WaitingRow => ({ placeId: name, name, what, from: 'From their website', kind, path: `/philly/admin/watches/place/${name}?from=todo` })
const closed = (name: string, from = 'OPERATIONAL', to = 'CLOSED_TEMPORARILY'): StatusChange => ({ name, category: 'restaurant', from, to, communitySlug: 'philly' })

const BUSY: Night = {
  community: PHILLY,
  timezone: 'America/New_York',
  at: AT,
  waiting: [
    row('Kol Tzedek', 'times', 'This week’s times, 1 change'),
    row('Temple Beth Zion-Beth Israel', 'times', 'This week’s times, 2 changes'),
    row('Congregation Rodeph Shalom', 'times', 'Next week’s times'),
    { ...row('Lower Merion Synagogue', 'times', 'A note changed'), from: 'From their newsletter' },
    { ...row('Sababa', 'kosher', 'Kosher certificate'), from: 'From Keystone-K’s list' },
  ],
  earlier: 0,
  people: 2,
  stopped: [{ name: 'South Philadelphia Shtiebel’s website', why: 'The page couldn’t be opened', kind: 'website', path: '/philly/admin/watches/place/sps' }],
  google: [closed('Hakol Bakery')],
  appUrl: 'https://guide.example',
}

describe('the sentence at the top', () => {
  it('by kind of change, then what broke, then Google (N7)', () => {
    expect(nightSentence(BUSY, googleChanges(BUSY.google, BUSY.waiting))).toBe('4 minyan time changes, 1 kosher certificate, and 1 website stopped working. Google marked 1 place closed.')
  })

  it('a quiet night (N8)', () => {
    const google = [closed('A', 'CLOSED_TEMPORARILY', 'OPERATIONAL'), closed('B')]
    expect(nightSentence({ waiting: [], stopped: [] }, google)).toBe('Nothing to check. Google updated 2 places on its own.')
  })

  it('two kinds: “and”, no comma', () => {
    expect(nightSentence({ waiting: [row('a', 'times')], stopped: [{ ...BUSY.stopped[0], kind: 'job' }] }, [])).toBe('1 minyan time change and 1 nightly job stopped working.')
  })
})

describe('the subject', () => {
  it('names the guide, and counts what waits', () => {
    expect(nightSubject(BUSY)).toBe('Philly Jewish Guide · Nightly watches: 5 to check')
    expect(nightSubject({ ...BUSY, waiting: [], stopped: [] })).toBe('Philly Jewish Guide · Nightly watches: nothing to check')
  })

  it('nothing to check but something broke: says that', () => {
    expect(nightSubject({ ...BUSY, waiting: [] })).toBe('Philly Jewish Guide · Nightly watches: 1 stopped working')
  })
})

describe('the night’s name', () => {
  it('is the evening before, in the community’s time zone', () => {
    expect(nightName(AT, 'America/New_York')).toBe('Thursday night, Nov 12')
  })
})

describe('what Google changed on its own', () => {
  it('one, two, or more, already on the site', () => {
    expect(googleLine([closed('Sababa')])).toBe('Google: Sababa is now temporarily closed. Already on the site.')
    expect(googleLine([closed('A', 'CLOSED_TEMPORARILY', 'OPERATIONAL'), closed('B')])).toBe('Google: A is open again. B is now temporarily closed. Both already on the site.')
  })

  it('a place closed and open again in one night says nothing; one waiting on To do isn’t said twice', () => {
    expect(googleChanges([closed('A'), closed('A', 'CLOSED_TEMPORARILY', 'OPERATIONAL')], [])).toEqual([])
    expect(googleChanges([closed('Kol Tzedek', 'OPERATIONAL', 'CLOSED_PERMANENTLY')], [row('Kol Tzedek', 'closed')])).toEqual([])
  })
})

describe('the email', () => {
  const email = buildNightlyEmail(BUSY)!
  const text = email.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('none on a night with nothing at all, even with older things on To do', () => {
    expect(buildNightlyEmail({ ...BUSY, waiting: [], stopped: [], google: [], earlier: 3, people: 2 })).toBeNull()
  })

  it('a quiet night with only Google still goes', () => {
    const quiet = buildNightlyEmail({ ...BUSY, waiting: [], stopped: [], people: 0 })!
    expect(quiet.subject).toBe('Philly Jewish Guide · Nightly watches: nothing to check')
    expect(quiet.html).not.toContain('Waiting for you')
    expect(quiet.html).not.toContain('Open To do')
    expect(quiet.html).toContain('Changed on its own · 1')
  })

  it('the sections in order, with their counts', () => {
    const at = (s: string) => text.indexOf(s)
    expect(at('Thursday night, Nov 12')).toBeGreaterThan(-1)
    expect(at('Thursday night')).toBeLessThan(at('Waiting for you · 5'))
    expect(at('Waiting for you · 5')).toBeLessThan(at('Stopped working · 1'))
    expect(at('Stopped working · 1')).toBeLessThan(at('Changed on its own · 1'))
    expect(text).toContain('Sent once a night to Philly’s admins.')
  })

  it('each place a row: name, what, where from, opening that place in To do', () => {
    expect(text).toContain('Kol Tzedek This week’s times, 1 change From their website')
    expect(text).toContain('Lower Merion Synagogue A note changed From their newsletter')
    expect(email.html).toContain('href="https://guide.example/philly/admin/watches/place/Kol Tzedek?from=todo"')
  })

  it('no times in the email: the details stay in To do', () => {
    expect(text).not.toMatch(/\d{1,2}:\d{2}\s?(am|pm)/i)
  })

  it('what else is on To do, then the button', () => {
    expect(text).toContain('Also in To do: 2 from people')
    expect(email.html).toMatch(/href="https:\/\/guide\.example\/philly\/admin"[^>]*>Open To do</)
    expect(buildNightlyEmail({ ...BUSY, people: 0 })!.html).not.toContain('Also in To do')
    expect(buildNightlyEmail({ ...BUSY, earlier: 3 })!.html).toContain('Also in To do: 3 from earlier nights and 2 from people')
  })

  it('what stopped working in red, opening its page in Watches', () => {
    expect(email.html).toMatch(/color:#b91c1c[^>]*>Stopped working · 1/)
    expect(text).toContain('South Philadelphia Shtiebel’s website The page couldn’t be opened')
    expect(email.html).toContain('href="https://guide.example/philly/admin/watches/place/sps"')
  })

  it('without the app’s address, rows without links', () => {
    const plain = buildNightlyEmail({ ...BUSY, appUrl: undefined })!
    expect(plain.html).not.toContain('href="/')
    expect(plain.html).not.toContain('Open To do')
  })

  it('a place’s name reaches the inbox as text, never HTML', () => {
    const bad = buildNightlyEmail({ ...BUSY, waiting: [row('<script>alert(1)</script>', 'other')] })!
    expect(bad.html).not.toContain('<script>')
    expect(bad.html).toContain('&lt;script&gt;')
  })
})
