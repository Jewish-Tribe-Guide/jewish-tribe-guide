import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { editWeek, isNoMinyan, usualWeekRows, weekPostFor, weekTitle, withNoMinyan, withWeekTimes } from './thisWeekEdit'

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

describe('the usual times a new week starts from', () => {
  it('this season’s, on the week’s days, with no season of their own', () => {
    const rows = usualWeekRows(
      [
        ...usual,
        { id: 'w', tefillah: 'maariv', days: ['mon'], time: '7:00pm', season: 'winter' },
        { id: 'su', tefillah: 'maariv', days: ['mon'], time: '8:30pm', season: 'summer' },
        { id: 'rc', tefillah: 'shacharis', days: ['rosh_chodesh', 'thu'], time: '6:30am' },
        { id: 'h', tefillah: 'shacharis', days: ['holiday'], time: '8:00am' },
      ],
      'winter',
    )
    expect(rows.map((m) => m.id)).toEqual(['s', 'm', 'w', 'rc'])
    expect(rows.find((m) => m.id === 'w')!.season).toBeUndefined()
    expect(rows.find((m) => m.id === 'rc')!.days).toEqual(['thu'])
  })

  // The user, Oct 23: it's only where the week starts, so it keeps
  // everything the usual row says, its note too.
  it('with the usual minyan’s note', () => {
    const [row] = usualWeekRows([{ id: 's', tefillah: 'shacharis', days: ['sat'], time: '10:00am', notes: 'Meets the first weekend of every month' }], null)
    expect(row).toEqual({ id: 's', tefillah: 'shacharis', days: ['sat'], time: '10:00am', notes: 'Meets the first weekend of every month' })
  })
})

describe('setting the week’s times', () => {
  it('opened and left as the usual times, nothing is added', () => {
    expect(withWeekTimes([], [], WEEK, usual, { usual, id: 'new', now: NOW })).toEqual([])
  })

  it('a changed time adds the week: in place of the usual times, on its dates', () => {
    const later = usual.map((m) => (m.id === 's' ? { ...m, time: '9:30am' } : m))
    const [week] = withWeekTimes([], [], WEEK, later, { usual, id: 'new', now: NOW })
    expect(week).toMatchObject({ id: 'new', name: 'Times for Oct 25 – Oct 31', from: WEEK.from, to: WEEK.to, mode: 'replace', kind: 'week', postedAt: NOW })
    expect(week.whole).toBeUndefined()
    expect(week.minyanim.find((m) => m.id === 's')).toMatchObject({ time: '9:30am', on: ['2026-10-31'] })
    expect(week.minyanim.find((m) => m.id === 'm')!.on).toEqual(['2026-10-25', '2026-10-26', '2026-10-30'])
  })

  it('put back to the usual times, the new week goes again', () => {
    const later = usual.map((m) => (m.id === 's' ? { ...m, time: '9:30am' } : m))
    const added = withWeekTimes([], [], WEEK, later, { usual, id: 'new', now: NOW })
    expect(withWeekTimes(added, [], WEEK, usual, { usual, id: 'other', now: NOW })).toEqual([])
  })

  it('a week the guide has is the one changed', () => {
    const had: SpecialSchedule = { id: 'web', name: 'Times for Oct 25 – Oct 31', from: WEEK.from, to: WEEK.to, mode: 'replace', kind: 'week', postedBy: 'website', minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['2026-10-31'], time: '10:00am' }] }
    const got = withWeekTimes([had], [had], WEEK, [{ id: 'x', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }], { usual, id: 'new', now: NOW })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'web', minyanim: [{ id: 'x', time: '9:00am', on: ['2026-10-31'] }] })
  })

  it('another week, and a Yom Tov schedule, are left alone', () => {
    const other: SpecialSchedule = { id: 'next', name: 'Times for Nov 1 – Nov 7', from: '2026-11-01', to: '2026-11-07', mode: 'replace', kind: 'week', minyanim: [] }
    const yt: SpecialSchedule = { id: 'yt', name: 'Sukkos', from: '2026-10-26', to: '2026-10-27', mode: 'replace', minyanim: [] }
    expect(weekPostFor([other, yt], WEEK)).toBeNull()
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

  it('a minyan added after it is the whole week: just that minyan', () => {
    const none = withNoMinyan([], WEEK, { id: 'new', now: NOW })
    const got = withWeekTimes(none, [], WEEK, [{ id: 'k', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }], { usual, id: 'other', now: NOW })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ id: 'new', whole: true, minyanim: [{ id: 'k', on: ['2026-10-31'] }] })
    expect(isNoMinyan(got[0])).toBe(false)
  })
})
