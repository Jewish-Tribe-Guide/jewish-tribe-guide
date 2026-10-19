import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { CalendarDay } from './jewishDays'
import { cleanSchedule, factsFor, readSchedules, resolveDay, sendsWeekly, thisWeeksPost, weekPostDays, weekPostRows, withSchedules, withWeekRows, dateKey, type SpecialSchedule } from './schedules'
import { listMinyanim, nextUpcomingDavening } from './upcomingDavening'
import { geoKey, geoOrCommunityDefault } from './useZmanAnchors'

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

  // Oct 19: Mekor's week, Sunday to Thursday, approved as "Shabbat
  // Schedule". The Minyanim list called Monday's Maariv "Shabbat Schedule
  // times", and left off the WhatsApp group every usual weekday one has.
  it('a week the shul sent out: “this week’s” unless just a Shabbos, its minyanim under the usual ones’ sign-up', () => {
    const group = { link: 'https://chat.whatsapp.com/Mekor' }
    const usual: Minyan[] = [
      { ...m('u1', 'mincha_maariv', ['sun', 'mon', 'tue', 'wed', 'thu'], '15 min before Sunset'), season: 'summer', signUp: group },
      { ...m('u2', 'shacharis', ['mon', 'thu'], '6:45am'), signUp: group },
      m('u3', 'shacharis', ['sat'], '9:15am'),
    ]
    const week: SpecialSchedule = {
      id: 'w',
      kind: 'week',
      name: 'Shabbat Schedule',
      from: '2026-10-04',
      to: '2026-10-08',
      mode: 'replace',
      minyanim: [
        { id: 'w1', tefillah: 'mincha_maariv', on: ['2026-10-04', '2026-10-05'], time: '5:55pm' },
        { id: 'w2', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:45am' },
        { id: 'w3', tefillah: 'maariv', on: ['2026-10-05'], time: '9:00pm' },
      ],
    }
    const day = resolveDay(usual, [week], mon)
    expect(day.posting).toEqual({ kind: 'schedule', name: 'Shabbat Schedule', thisWeek: true })
    expect(day.rows.map((r) => [r.id, r.signUp?.link ?? null])).toEqual([
      ['w1', group.link],
      ['w2', group.link],
      ['w3', null],
    ])
    // Just a Shabbos keeps its name; a festival's schedule takes no sign-up.
    const shabbos: SpecialSchedule = { ...week, name: 'Shabbos Bereishis', from: '2026-10-02', to: '2026-10-03', minyanim: [{ id: 's1', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:00am' }] }
    expect(resolveDay(usual, [shabbos], sat).posting).toEqual({ kind: 'schedule', name: 'Shabbos Bereishis' })
    expect(resolveDay(usual, [{ ...sukkos, minyanim: [{ id: 'f', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:45am' }], to: '2026-10-05' }], mon).rows[0].signUp).toBeUndefined()
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

  it('a time set from sunset is worked out from it, like a regular one', () => {
    const fromSunset: SpecialSchedule = {
      ...sukkos,
      minyanim: [{ id: 'e', tefillah: 'mincha', on: ['chol_hamoed'], time: '10 min before Sunset', anchor: 'sunset', offsetMinutes: -10 }],
    }
    const anchors = { [geoKey(geoOrCommunityDefault(undefined))]: { sunsetIso: '2026-10-01T18:40:00-04:00' } }
    const list = listMinyanim(shul([fromSunset]), { ...opts, today: [...opts.today], tomorrow: [...opts.tomorrow], anchors })
    expect(list.today.map((s) => [s.tefillah, s.time, s.anchored])).toEqual([['mincha', '6:30 PM', true]])
  })

  it('without one, the regular times', () => {
    const next = nextUpcomingDavening(shul([]), { ...opts, today: [...opts.today], tomorrow: [...opts.tomorrow], nowMinutes: 17 * 60 })
    expect(next).toMatchObject({ label: 'Maariv', time: '7:45pm' })
  })
})

describe('a schedule sent from a visitor', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  const sent = (row: Record<string, unknown>) => cleanSchedule({ ...sukkos, minyanim: [{ id: 'e', tefillah: 'mincha', on: ['chol_hamoed'], ...row }] }, now)?.minyanim[0]

  it('keeps a time set from sunset, its words worked out again from the minutes', () => {
    // Before this, the rule was stripped and only its words kept: a time
    // nothing could work out, so it never showed.
    expect(sent({ time: '10 min before Sunset', anchor: 'sunset', offsetMinutes: -10 })).toEqual({
      id: 'e',
      tefillah: 'mincha',
      on: ['chol_hamoed'],
      time: '10 min before Sunset',
      anchor: 'sunset',
      offsetMinutes: -10,
    })
    expect(sent({ time: '6:00pm', anchor: 'sunset', offsetMinutes: 15 })?.time).toBe('15 min after Sunset')
  })

  it('only sunset, and only a sensible number of minutes', () => {
    // The guide's candle lighting is the coming Shabbos's, not a Yom Tov date's.
    expect(sent({ time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0 })).not.toHaveProperty('anchor')
    expect(sent({ time: '6:30pm', anchor: 'sunset', offsetMinutes: 900 })).toEqual({ id: 'e', tefillah: 'mincha', on: ['chol_hamoed'], time: '6:30pm' })
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

// Oct 6: a shul that sends out its times each week.
describe('a shul’s weekly schedule', () => {
  const post = (name: string, from: string, to: string, kind: 'week' | null = 'week'): SpecialSchedule => ({ id: name, name, from, to, mode: 'replace', minyanim: [], ...(kind ? { kind } : {}) })
  it('keeps what kind of schedule it is, and when it was posted, through a read', () => {
    expect(readSchedules([{ ...post('A', '2026-10-09', '2026-10-10'), postedAt: '2026-10-07T15:00:00Z' }])[0]).toMatchObject({ kind: 'week', postedAt: '2026-10-07T15:00:00Z' })
    expect(readSchedules([{ ...post('B', '2026-10-09', '2026-10-10'), kind: 'nonsense', postedAt: 'whenever' }])[0]).not.toHaveProperty('kind')
  })
  it('sends one each week: two week posts in the last eight weeks; a Yom Tov schedule doesn’t count', () => {
    const two = [post('Haazinu', '2026-09-25', '2026-09-26'), post('Oct 2', '2026-10-02', '2026-10-03')]
    expect(sendsWeekly(two, '2026-10-08')).toBe(true)
    expect(sendsWeekly(two.slice(1), '2026-10-08')).toBe(false)
    expect(sendsWeekly([two[0], post('Sukkos 5787', '2026-09-26', '2026-10-04', null)], '2026-10-08')).toBe(false)
    expect(sendsWeekly(two, '2026-12-01')).toBe(false)
  })
  it('this week’s post: the one for the week today is in, Sunday to Shabbos, not yet over', () => {
    const bereishis = post('Bereishis', '2026-10-09', '2026-10-10')
    expect(thisWeeksPost([bereishis], '2026-10-04')?.name).toBe('Bereishis') // the Sunday before
    expect(thisWeeksPost([bereishis], '2026-10-10')?.name).toBe('Bereishis')
    expect(thisWeeksPost([bereishis], '2026-10-11')).toBeUndefined() // the Sunday after
    expect(thisWeeksPost([bereishis], '2026-10-03')).toBeUndefined() // the Shabbos before
  })
})

// Oct 19: a week the shul sent out, edited from its own box: its times as
// rows on weekdays, and back on its own dates.
describe('editing this week’s schedule', () => {
  const week: SpecialSchedule = {
    id: 'w1',
    name: 'Shabbos Bereishis',
    from: '2026-10-09',
    to: '2026-10-10',
    mode: 'replace',
    kind: 'week',
    minyanim: [
      { id: 'fn', tefillah: 'mincha_maariv', on: ['2026-10-09'], time: '6:10pm' },
      { id: 'sm', tefillah: 'shacharis', on: ['sat'], time: '9:00am' },
    ],
  }
  const yomTov: SpecialSchedule = { id: 'y', name: 'Sukkos', from: '2026-09-26', to: '2026-10-04', mode: 'replace', minyanim: [] }

  it('offers the days it covers, Sunday first', () => {
    expect(weekPostDays(week)).toEqual(['fri', 'sat'])
    expect(weekPostDays({ from: '2026-10-10', to: '2026-10-12' })).toEqual(['sun', 'mon', 'sat'])
  })

  it('reads its times as weekday rows', () => {
    expect(weekPostRows(week)).toEqual([
      { id: 'fn', tefillah: 'mincha_maariv', days: ['fri'], time: '6:10pm' },
      { id: 'sm', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
    ])
  })

  it('sends nothing different when nothing changed', () => {
    expect(withWeekRows([yomTov, week], 'w1', weekPostRows(week))).toEqual([yomTov, week])
  })

  it('puts a changed or new time on the week’s own dates, drops one taken out, and leaves other schedules alone', () => {
    const rows: Minyan[] = [
      { id: 'sm', tefillah: 'shacharis', days: ['sat'], time: '8:45am' },
      { id: 'new', tefillah: 'mincha', days: ['fri', 'sat'], time: '1:30pm', signUp: { name: 'x' } },
    ]
    const [y, w] = withWeekRows([yomTov, week], 'w1', rows)
    expect(y).toBe(yomTov)
    expect(w).toEqual({
      ...week,
      minyanim: [
        { id: 'sm', tefillah: 'shacharis', on: ['2026-10-10'], time: '8:45am' },
        { id: 'new', tefillah: 'mincha', on: ['2026-10-09', '2026-10-10'], time: '1:30pm' },
      ],
    })
  })
})
