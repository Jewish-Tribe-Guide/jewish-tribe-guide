import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { editWeek, isNoMinyan, weekAfter, weekDiffers, weekPostFor, weekRowsFor, weekTitle, withNoMinyan, withWeekTimes } from './thisWeekEdit'

// The Little Shul (the user, Oct 23): Edit listing adds this week's
// schedule, or that there's no minyan this week.
const WEEK = { from: '2026-10-25', to: '2026-10-31' }
const NOW = '2026-10-25T15:00:00.000Z'
const usual: Minyan[] = [
  { id: 's', tefillah: 'shacharis', days: ['sat'], time: '10:00am' },
  { id: 'm', tefillah: 'mincha', days: ['sun', 'mon', 'fri'], time: '6:00pm' },
]

describe('which week', () => {
  it('Sunday to Shabbos around today', () => {
    expect(editWeek('2026-10-28', false)).toEqual(WEEK)
    expect(editWeek('2026-10-25', false)).toEqual(WEEK)
    expect(editWeek('2026-10-31', false)).toEqual(WEEK)
  })

  it('the week ahead once Shabbos is over', () => {
    expect(editWeek('2026-10-24', true)).toEqual(WEEK)
  })

  it('a new week goes by its dates', () => {
    expect(weekTitle(WEEK)).toBe('Times for Oct 25 – Oct 31')
  })
})

// The user, Oct 31: "we keep pulling in minyan times from usual to this week
// and vice versa". Mekor's post ran Oct 23 – Oct 31, with the 9:15 of Oct 24.
const OPTS = { id: 'new', now: NOW }
const straddling: SpecialSchedule = {
  id: 'mekor',
  name: 'Times for Oct 23 – Oct 30',
  from: '2026-10-23',
  to: '2026-10-31',
  mode: 'replace',
  kind: 'week',
  minyanim: [
    { id: 'last', tefillah: 'shacharis', on: ['2026-10-24'], time: '9:15am' },
    { id: 'this', tefillah: 'mincha_maariv', on: ['2026-10-26', '2026-10-27'], time: '4:45pm' },
  ],
}

describe('the rows a week shows', () => {
  it('nothing posted is empty: the usual times aren’t in it', () => {
    expect(weekRowsFor(null, WEEK)).toEqual([])
  })

  it('only the times dated in the week', () => {
    expect(weekRowsFor(straddling, WEEK)).toEqual([{ id: 'this', tefillah: 'mincha_maariv', days: ['mon', 'tue'], time: '4:45pm' }])
  })

  it('the week after is the next Sunday to Shabbos', () => {
    expect(weekAfter(WEEK)).toEqual({ from: '2026-11-01', to: '2026-11-07' })
  })

  it('the post it edits is the one the box shows: the latest-starting', () => {
    const newer: SpecialSchedule = { ...straddling, id: 'newer', from: WEEK.from, to: WEEK.to }
    expect(weekPostFor([straddling, newer], WEEK)!.id).toBe('newer')
  })
})

describe('setting the week’s times', () => {
  it('opened and left empty, nothing is added', () => {
    expect(withWeekTimes([], [], WEEK, [], OPTS)).toEqual([])
  })

  it('a time adds the week, holding just that time, on its date', () => {
    const [week, ...rest] = withWeekTimes([], [], WEEK, [{ id: 's', tefillah: 'shacharis', days: ['sat'], time: '9:30am' }], OPTS)
    expect(rest).toEqual([])
    expect(week).toMatchObject({ id: 'new', name: 'Times for Oct 25 – Oct 31', from: WEEK.from, to: WEEK.to, mode: 'replace', kind: 'week', postedAt: NOW })
    expect(week.whole).toBeUndefined()
    expect(week.minyanim).toEqual([{ id: 's', tefillah: 'shacharis', on: ['2026-10-31'], time: '9:30am' }])
  })

  it('emptied again, the new week goes again', () => {
    const added = withWeekTimes([], [], WEEK, [usual[0]], OPTS)
    expect(withWeekTimes(added, [], WEEK, [], { ...OPTS, id: 'other' })).toEqual([])
  })

  it('a week the guide has is the one changed', () => {
    const had: SpecialSchedule = { id: 'web', name: 'Times for Oct 25 – Oct 31', from: WEEK.from, to: WEEK.to, mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['2026-10-31'], time: '10:00am' }] }
    const got = withWeekTimes([had], [had], WEEK, [{ id: 'x', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }], OPTS)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'web', minyanim: [{ id: 'x', time: '9:00am', on: ['2026-10-31'] }] })
  })

  it('another week, and a Yom Tov schedule, are left alone', () => {
    const other: SpecialSchedule = { id: 'next', name: 'Times for Nov 1 – Nov 7', from: '2026-11-01', to: '2026-11-07', mode: 'replace', kind: 'week', minyanim: [] }
    const yt: SpecialSchedule = { id: 'yt', name: 'Sukkos', from: '2026-10-26', to: '2026-10-27', mode: 'replace', minyanim: [] }
    expect(weekPostFor([other, yt], WEEK)).toBeNull()
  })

  it('a post running past the week: opened and left as it is, nothing changes', () => {
    expect(withWeekTimes([straddling], [straddling], WEEK, weekRowsFor(straddling, WEEK), OPTS)).toEqual([straddling])
  })

  it('a post running past the week: a Saturday added goes on this Saturday only, and last week’s stays', () => {
    const rows = [...weekRowsFor(straddling, WEEK), { id: 'k', tefillah: 'shacharis' as const, days: ['sat' as const], time: '9:00am' }]
    const [post] = withWeekTimes([straddling], [straddling], WEEK, rows, OPTS)
    expect(post.minyanim.find((m) => m.id === 'k')!.on).toEqual(['2026-10-31'])
    expect(post.minyanim.find((m) => m.id === 'last')!.on).toEqual(['2026-10-24'])
  })

  it('a post running past the week: a time changed here keeps the old one on the other week’s date', () => {
    const across: SpecialSchedule = { ...straddling, minyanim: [{ id: 'a', tefillah: 'shacharis', on: ['2026-10-24', '2026-10-31'], time: '9:15am' }] }
    const [post] = withWeekTimes([across], [across], WEEK, [{ id: 'a', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }], OPTS)
    expect(post.minyanim).toEqual([
      { id: 'a', tefillah: 'shacharis', on: ['2026-10-31'], time: '9:00am' },
      { id: 'a-2026-10-24', tefillah: 'shacharis', on: ['2026-10-24'], time: '9:15am' },
    ])
  })

  it('a post running past the week: all taken out here, last week’s stays', () => {
    const [post] = withWeekTimes([straddling], [straddling], WEEK, [], OPTS)
    expect(post.minyanim).toEqual([straddling.minyanim[0]])
  })

  it('a day the post didn’t reach is held, not dropped', () => {
    const shabbos: SpecialSchedule = { ...straddling, from: '2026-10-30', to: '2026-10-31', minyanim: [] }
    const [post] = withWeekTimes([shabbos], [shabbos], WEEK, [{ id: 'k', tefillah: 'mincha', days: ['mon'], time: '6:00pm' }], OPTS)
    expect(post).toMatchObject({ from: '2026-10-26', to: '2026-10-31', minyanim: [{ id: 'k', on: ['2026-10-26'] }] })
  })
})

describe('whether a week changed', () => {
  it('a change in another week of the same post isn’t this week’s', () => {
    const next = { from: '2026-10-18', to: '2026-10-24' }
    const changed = withWeekTimes([straddling], [straddling], next, [{ id: 'last', tefillah: 'shacharis', days: ['sat'], time: '9:30am' }], OPTS)
    expect(weekDiffers([straddling], changed, next)).toBe(true)
    expect(weekDiffers([straddling], changed, WEEK)).toBe(false)
  })
})

describe('no minyan this week', () => {
  it('a new week, whole, with no minyanim', () => {
    const [week] = withNoMinyan([], WEEK, { id: 'new', now: NOW })
    expect(week).toMatchObject({ id: 'new', kind: 'week', mode: 'replace', whole: true, minyanim: [] })
    expect(isNoMinyan(week)).toBe(true)
  })

  it('the week the guide has, emptied', () => {
    const had: SpecialSchedule = { id: 'p', name: 'Shabbos', from: '2026-10-30', to: '2026-10-31', mode: 'replace', kind: 'week', minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['2026-10-31'], time: '10:00am' }] }
    const got = withNoMinyan([had], WEEK, { id: 'new', now: NOW })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'p', whole: true, minyanim: [] })
  })

  it('a post running past the week keeps its other dates; this week goes on its own', () => {
    const got = withNoMinyan([straddling], WEEK, { id: 'new', now: NOW })
    expect(got.find((s) => s.id === 'mekor')!.minyanim).toEqual([straddling.minyanim[0]])
    expect(isNoMinyan(weekPostFor(got, WEEK))).toBe(true)
  })

  it('a minyan added after it is the whole week: just that minyan', () => {
    const none = withNoMinyan([], WEEK, { id: 'new', now: NOW })
    const got = withWeekTimes(none, [], WEEK, [{ id: 'k', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }], { id: 'other', now: NOW })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'new', whole: true, minyanim: [{ id: 'k', on: ['2026-10-31'] }] })
    expect(isNoMinyan(got[0])).toBe(false)
  })
})
