import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { CalendarDay } from './jewishDays'
import { factsFor, readSchedules, resolveDay, withSchedules, dateKey, type SpecialSchedule } from './schedules'
import { listMinyanim, nextUpcomingDavening } from './upcomingDavening'

// This week, as the calendar has it (Hebcal, Oct 1 2026): Chol HaMoed
// Thursday, Hoshana Rabbah Friday, Shemini Atzeres on Shabbos, Simchas
// Torah Sunday.
const days: CalendarDay[] = [
  { date: '2026-10-01', yomTov: false, cholHamoed: true, name: 'Chol HaMoed', festival: 'Sukkos' },
  { date: '2026-10-02', yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: 'Sukkos' },
  { date: '2026-10-03', yomTov: true, cholHamoed: false, name: 'Shemini Atzeres', festival: 'Sukkos' },
  { date: '2026-10-04', yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' },
]
const through = '2026-10-07'
const thu = factsFor('2026-10-01', days, through)
const fri = factsFor('2026-10-02', days, through)
const sat = factsFor('2026-10-03', days, through)
const sun = factsFor('2026-10-04', days, through)
const mon = factsFor('2026-10-05', days, through)

const m = (id: string, tefillah: Minyan['tefillah'], dayKeys: Minyan['days'], time: string): Minyan => ({ id, tefillah, days: dayKeys, time })
const regular: Minyan[] = [
  m('r1', 'shacharis', ['mon', 'tue', 'wed', 'thu', 'fri'], '7:00am'),
  m('r2', 'maariv', ['sun', 'mon', 'tue', 'wed', 'thu'], '7:45pm'),
  m('r3', 'shacharis', ['sat'], '9:30am'),
]
const sukkos: SpecialSchedule = {
  id: 's1',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  mode: 'replace',
  minyanim: [
    { id: 'a', tefillah: 'shacharis', on: ['chol_hamoed'], time: '6:45am' },
    { id: 'b', tefillah: 'mincha_maariv', on: ['chol_hamoed'], time: '6:30pm' },
    { id: 'c', tefillah: 'shacharis', on: ['2026-10-02'], time: '6:30am' },
    { id: 'd', tefillah: 'shacharis', on: ['yom_tov'], time: '9:00am' },
  ],
}

describe('the calendar’s facts for a date', () => {
  it('a named day, an ordinary day within what it covers, and a day past it unknown', () => {
    expect(sat).toMatchObject({ weekday: 'sat', yomTov: true, festival: 'Sukkos', name: 'Shemini Atzeres' })
    expect(mon).toMatchObject({ weekday: 'mon', yomTov: false, cholHamoed: false, festival: null })
    expect(factsFor('2026-10-20', days, through)).toMatchObject({ weekday: 'tue', yomTov: null, cholHamoed: null })
    expect(factsFor('2026-10-01', undefined, undefined)).toMatchObject({ yomTov: null })
  })
})

describe('what a shul has on a date', () => {
  it('a schedule that replaces the regular times: its own, by Chol HaMoed, date and Yom Tov', () => {
    expect(resolveDay(regular, [sukkos], thu)).toMatchObject({ skip: true, posting: { kind: 'schedule', name: 'Sukkos 5787' } })
    expect(resolveDay(regular, [sukkos], thu).rows.map((r) => r.time)).toEqual(['6:45am', '6:30pm'])
    // Hoshana Rabbah is Chol HaMoed and its own date: both apply.
    expect(resolveDay(regular, [sukkos], fri).rows.map((r) => r.time)).toEqual(['6:45am', '6:30pm', '6:30am'])
    expect(resolveDay(regular, [sukkos], sat).rows.map((r) => [r.time, r.days])).toEqual([['9:00am', [dateKey('2026-10-03')]]])
  })

  it('after it ends, the regular times again, plainly', () => {
    expect(resolveDay(regular, [sukkos], mon)).toEqual({ rows: [], skip: false, posting: { kind: 'regular' } })
  })

  it('a festival day with nothing posted: the regular times, marked not posted, never presented as the festival’s', () => {
    expect(resolveDay(regular, [], sat).posting).toEqual({ kind: 'not-posted', festival: 'Sukkos' })
    expect(resolveDay(regular, [], thu).posting).toEqual({ kind: 'not-posted', festival: 'Sukkos' })
    // A shul that tags its regular rows Yom Tov has posted for it.
    expect(resolveDay([...regular, m('y', 'shacharis', ['yom_tov'], '9:00am')], [], sat).posting).toEqual({ kind: 'regular' })
  })

  it('a day a replacing schedule leaves out says not posted, rather than guessing', () => {
    const shabbosOnly: SpecialSchedule = { ...sukkos, minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['yom_tov'], time: '9:00am' }] }
    expect(resolveDay(regular, [shabbosOnly], thu)).toEqual({ rows: [], skip: false, posting: { kind: 'not-posted', festival: 'Sukkos' } })
  })

  it('a schedule that adds to the regular times keeps them', () => {
    const extra: SpecialSchedule = { ...sukkos, mode: 'add', minyanim: [{ id: 'h', tefillah: 'other', on: ['2026-10-04'], time: '7:30pm', notes: 'Hakafos' }] }
    expect(resolveDay(regular, [extra], sun)).toMatchObject({ skip: false, posting: { kind: 'schedule' } })
  })

  it('the calendar not knowing a day doesn’t make it “not posted”', () => {
    expect(resolveDay(regular, [], factsFor('2026-10-01', undefined, undefined)).posting).toEqual({ kind: 'regular' })
  })
})

describe('the next minyan, with a schedule applied', () => {
  const shul = (sched: SpecialSchedule[]) => {
    const w = withSchedules(regular, sched, [thu, fri])
    return [{ id: 'k', name: 'Kesher Israel', minyanim: w.minyanim }]
  }
  const opts = { today: ['thu', dateKey('2026-10-01')], tomorrow: ['fri', dateKey('2026-10-02')], season: null, anchors: {} } as const

  it('Thursday evening on Chol HaMoed: the schedule’s 6:30 PM, not the regular 7:45 PM Maariv', () => {
    const next = nextUpcomingDavening(shul([sukkos]), { ...opts, today: [...opts.today], tomorrow: [...opts.tomorrow], nowMinutes: 17 * 60 })
    expect(next).toMatchObject({ label: 'Mincha & Maariv', time: '6:30pm' })
    const list = listMinyanim(shul([sukkos]), { ...opts, today: [...opts.today], tomorrow: [...opts.tomorrow] })
    expect(list.today.map((s) => [s.time, s.schedule])).toEqual([
      ['6:45am', 'Sukkos 5787'],
      ['6:30pm', 'Sukkos 5787'],
    ])
  })

  it('without one, the regular times', () => {
    const next = nextUpcomingDavening(shul([]), { ...opts, today: [...opts.today], tomorrow: [...opts.tomorrow], nowMinutes: 17 * 60 })
    expect(next).toMatchObject({ label: 'Maariv', time: '7:45pm' })
  })
})

describe('reading stored schedules', () => {
  it('keeps the well-formed, drops the rest', () => {
    expect(readSchedules([sukkos])).toEqual([sukkos])
    expect(readSchedules([{ ...sukkos, from: '2026-10-05' }])).toEqual([])
    expect(readSchedules([{ ...sukkos, mode: 'sometimes' }])).toEqual([])
    expect(readSchedules([{ ...sukkos, minyanim: [{ id: 'z', tefillah: 'shacharis', on: ['someday'], time: '7' }] }])[0].minyanim).toEqual([])
    expect(readSchedules('nope')).toEqual([])
  })
})
