import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { CalendarDay } from './jewishDays'
import { cleanSchedule, factsFor, formatSchedulesSummary, readSchedules, usualJoinLink, resolveDay, sendsWeekly, shabbosIsOver, signUpGroup, thisWeeksDays, weekPostDays, weekPostRows, withSchedules, withWeekRows, dateKey, type SpecialSchedule } from './schedules'
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

  // Oct 22: Kol Tzedek's website gave Oct 22–24 as only Shabbos morning,
  // and its Thursday said "Times for Oct 18 – Oct 24 times not posted".
  it('a day a week the shul sent out leaves out: its usual times, plainly; on a festival, still not posted', () => {
    const week: SpecialSchedule = { id: 'w', kind: 'week', name: 'Times for Oct 18 – Oct 24', from: '2026-10-05', to: '2026-10-10', mode: 'replace', postedBy: 'website', minyanim: [{ id: 'ws', tefillah: 'shacharis', on: ['2026-10-10'], time: '10:00am' }] }
    expect(resolveDay(regular, [week], mon)).toEqual({ rows: [], skip: false, posting: { kind: 'regular' } })
    const holiday: SpecialSchedule = { ...week, from: '2026-10-01', to: '2026-10-03', minyanim: [{ id: 'ws', tefillah: 'shacharis', on: ['2026-10-03'], time: '10:00am' }] }
    expect(resolveDay(regular, [holiday], thu).posting).toEqual({ kind: 'not-posted', festival: 'Sukkos' })
  })

  // Oct 20: a calendar's dated service is a one-day addition, and as the
  // latest-starting schedule it won the day, putting off the Sukkos times
  // (or a week the shul sent out) that day.
  it('a one-day addition is as well as the schedule the day has, never in its place', () => {
    const thursday: SpecialSchedule = { id: 't', name: 'Thu Oct 1', from: '2026-10-01', to: '2026-10-01', mode: 'add', postedBy: 'website', minyanim: [{ id: 'tm', tefillah: 'shacharis', on: ['2026-10-01'], time: '8:10am' }] }
    expect(resolveDay(regular, [sukkos, thursday], thu)).toMatchObject({ skip: true, posting: { kind: 'schedule', name: 'Sukkos 5787' } })
    expect(resolveDay(regular, [sukkos, thursday], thu).rows.map((r) => [r.time, r.schedule])).toEqual([
      ['6:45am', 'Sukkos 5787'],
      ['6:30pm', 'Sukkos 5787'],
      ['8:10am', 'Thu Oct 1'],
    ])
    // A week the shul sent out, the same.
    const week: SpecialSchedule = { id: 'w', name: 'Times for Oct 1', from: '2026-10-01', to: '2026-10-01', mode: 'replace', kind: 'week', minyanim: [{ id: 'wm', tefillah: 'mincha', on: ['2026-10-01'], time: '6:00pm' }] }
    expect(resolveDay(regular, [thursday, week], thu).rows.map((r) => r.time)).toEqual(['6:00pm', '8:10am'])
    // Alone, it's the day's schedule, as before.
    expect(resolveDay(regular, [thursday], mon).rows).toEqual([])
    expect(resolveDay(regular, [thursday], thu)).toMatchObject({ skip: false, posting: { kind: 'schedule', name: 'Thu Oct 1' } })
  })

  it('a schedule that adds to the regular times keeps them', () => {
    const extra: SpecialSchedule = { ...sukkos, mode: 'add', minyanim: [{ id: 'h', tefillah: 'other', on: ['2026-10-04'], time: '7:30pm', notes: 'Hakafos' }] }
    expect(resolveDay(regular, [extra], sun)).toMatchObject({ skip: false, posting: { kind: 'schedule' } })
  })

  // Oct 19: Mekor's week, Sunday to Thursday, approved as "Shabbat
  // Schedule". The Minyanim list called Monday's Maariv "Shabbat Schedule
  // times", and left off the WhatsApp group every usual weekday one has.
  it('a week the shul sent out: “this week’s”, its minyanim under the usual ones’ sign-up', () => {
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
    // Just a Shabbos is this week's too, though its card keeps the name
    // (Mikveh Israel's "Shabbat Lekh Lekha", Oct 23); a festival's schedule
    // takes no sign-up.
    const shabbos: SpecialSchedule = { ...week, name: 'Shabbos Bereishis', from: '2026-10-02', to: '2026-10-03', minyanim: [{ id: 's1', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:00am' }] }
    expect(resolveDay(usual, [shabbos], sat).posting).toEqual({ kind: 'schedule', name: 'Shabbos Bereishis', thisWeek: true })
    expect(resolveDay(usual, [{ ...shabbos, kind: undefined }], sat).posting).toEqual({ kind: 'schedule', name: 'Shabbos Bereishis' })
    expect(resolveDay(usual, [{ ...sukkos, minyanim: [{ id: 'f', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:45am' }], to: '2026-10-05' }], mon).rows[0].signUp).toBeUndefined()
  })

  // Oct 23: a newsletter's "held when there is sufficient interest" makes
  // that week's minyan a sign-up one, with its own group.
  it('a week’s minyan marked sign-up keeps its own, even with no group yet', () => {
    const usual: Minyan[] = [{ ...m('u1', 'maariv', ['mon'], '8:00pm'), signUp: { link: 'https://chat.whatsapp.com/Usual' } }]
    const week: SpecialSchedule = {
      id: 'w',
      kind: 'week',
      name: 'This week',
      from: '2026-10-04',
      to: '2026-10-08',
      mode: 'replace',
      minyanim: [
        { id: 'w1', tefillah: 'maariv', on: ['2026-10-05'], time: '9:00pm', signUp: { link: 'https://chat.whatsapp.com/Late' } },
        { id: 'w2', tefillah: 'shacharis', on: ['2026-10-05'], time: '6:45am', signUp: {} },
      ],
    }
    expect(resolveDay(usual, [week], mon).rows.map((r) => [r.id, r.signUp])).toEqual([
      ['w1', { link: 'https://chat.whatsapp.com/Late' }],
      ['w2', {}],
    ])
  })

  // BZBI, Oct 23: its usual Shabbos 9:30AM, and "Sat Oct 24" 9:30 AM off
  // its newsletter, were two rows on the Minyanim page.
  describe('a dated time as well as the usual ones', () => {
    const usual = [m('u1', 'shacharis', ['sat'], '9:30AM'), m('u2', 'mincha', ['sat'], '1:30pm')]
    const oneDay = (id: string, tefillah: Minyan['tefillah'], time: string): SpecialSchedule => ({ id, name: 'Sat Oct 3', from: '2026-10-03', to: '2026-10-03', mode: 'add', minyanim: [{ id: `${id}m`, tefillah, on: ['2026-10-03'], time }] })

    it('isn’t one of the usual times again', () => {
      expect(resolveDay(usual, [oneDay('a', 'shacharis', '9:30 AM')], sat)).toMatchObject({ rows: [], skip: false })
      expect(resolveDay(usual, [oneDay('a', 'shacharis', '8:00 AM')], sat).rows.map((r) => r.time)).toEqual(['8:00 AM'])
    })

    it('every one that day is shown, not just the first', () => {
      expect(resolveDay(usual, [oneDay('a', 'shacharis', '8:00 AM'), oneDay('b', 'maariv', '7:30 PM')], sat).rows.map((r) => r.time)).toEqual(['8:00 AM', '7:30 PM'])
    })

    it('a week that replaces the usual times keeps it, the usual time being gone that day', () => {
      const week: SpecialSchedule = { id: 'w', kind: 'week', name: 'Times for Sep 27 – Oct 3', from: '2026-09-27', to: '2026-10-03', mode: 'replace', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:00am' }] }
      expect(resolveDay(usual, [week, oneDay('a', 'shacharis', '9:30 AM')], sat)).toMatchObject({ skip: true, rows: [{ time: '9:00am' }, { time: '9:30 AM' }] })
    })

    // BZBI, Oct 23 again: a week posted from a paste gave that Shabbos
    // 9:30AM, and the newsletter's one-day "9:30 AM" was still there. Two
    // 9:30 Shacharis on the Minyanim page.
    it('isn’t one of the week’s own times again', () => {
      const week: SpecialSchedule = { id: 'w', kind: 'week', name: 'Times for Sep 27 – Oct 3', from: '2026-09-27', to: '2026-10-03', mode: 'replace', minyanim: [{ id: 'w1', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:30AM' }] }
      expect(resolveDay(usual, [oneDay('a', 'shacharis', '9:30 AM'), week], sat)).toMatchObject({ skip: true, rows: [{ id: 'w1', time: '9:30AM' }] })
      expect(resolveDay(usual, [oneDay('a', 'maariv', '7:30 PM'), week], sat).rows.map((r) => r.time)).toEqual(['9:30AM', '7:30 PM'])
    })
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
  it('this week’s schedule: the week today is in, Sunday to Shabbos, from today, not yet over', () => {
    const bereishis = {
      ...post('Bereishis', '2026-10-09', '2026-10-10'),
      minyanim: [
        { id: 'f', tefillah: 'mincha', on: ['2026-10-09'], time: '6:00pm' },
        { id: 's', tefillah: 'shacharis', on: ['sat'], time: '9:00am' },
      ],
    } satisfies SpecialSchedule
    const dates = (today: string) => thisWeeksDays([bereishis], today).days.map((d) => d.date)
    expect(dates('2026-10-04')).toEqual(['2026-10-09', '2026-10-10']) // the Sunday before
    expect(dates('2026-10-10')).toEqual(['2026-10-10'])
    expect(dates('2026-10-11')).toEqual([]) // the Sunday after
    expect(dates('2026-10-03')).toEqual([]) // the Shabbos before
    expect(thisWeeksDays([bereishis], '2026-10-04').posts.map((p) => p.name)).toEqual(['Bereishis'])
  })
  // Oct 23: "on Friday people want to see shabbos as last. But right when
  // shabbos is over we need to show the week's schedule."
  it('once Shabbos is over, the week ahead: Sunday to Shabbos', () => {
    const lekhLekha = { ...post('Lekh Lekha', '2026-10-23', '2026-10-24'), minyanim: [{ id: 's', tefillah: 'shacharis', on: ['sat'], time: '9:00am' }] } satisfies SpecialSchedule
    const next = { ...post('Times for Oct 25 – Oct 31', '2026-10-25', '2026-10-31'), minyanim: [{ id: 'm', tefillah: 'shacharis', on: ['mon', 'thu'], time: '6:45am' }] } satisfies SpecialSchedule
    const dates = (today: string, shabbosOver?: boolean) => thisWeeksDays([lekhLekha, next], today, { shabbosOver }).days.map((d) => d.date)
    expect(dates('2026-10-23')).toEqual(['2026-10-24']) // Friday: Shabbos last
    expect(dates('2026-10-24')).toEqual(['2026-10-24']) // Shabbos itself
    expect(dates('2026-10-24', true)).toEqual(['2026-10-26', '2026-10-29']) // after havdalah
    expect(thisWeeksDays([lekhLekha, next], '2026-10-24', { shabbosOver: true }).posts.map((p) => p.name)).toEqual(['Times for Oct 25 – Oct 31'])
  })

  it('Shabbos is over once its havdalah has passed, and only on Shabbos', () => {
    const havdalah = '2026-10-24T18:58:00-04:00'
    expect(shabbosIsOver('2026-10-24', Date.parse('2026-10-24T18:57:00-04:00'), havdalah)).toBe(false)
    expect(shabbosIsOver('2026-10-24', Date.parse('2026-10-24T18:58:00-04:00'), havdalah)).toBe(true)
    // Not known: not over.
    expect(shabbosIsOver('2026-10-24', Date.parse('2026-10-24T23:00:00-04:00'), undefined)).toBe(false)
    // Friday night, havdalah tomorrow; and Sunday is just the week.
    expect(shabbosIsOver('2026-10-23', Date.parse('2026-10-23T22:00:00-04:00'), havdalah)).toBe(false)
    expect(shabbosIsOver('2026-10-25', Date.parse('2026-10-25T10:00:00-04:00'), havdalah)).toBe(false)
  })

  // Oct 20: Rodeph Shalom's calendar gave its Thursday minyan date by date,
  // approved, and the listing showed nothing until the day before.
  it('this week’s additions: one-day times, from today to Shabbos, in date order', () => {
    const day = (date: string, extra: object = {}): SpecialSchedule => ({
      id: date, name: date, from: date, to: date, mode: 'add', postedBy: 'website',
      minyanim: [{ id: `${date}m`, tefillah: 'shacharis', on: [date], time: '8:10 AM' }], ...extra,
    })
    const all = [day('2026-10-29'), day('2026-10-22'), day('2026-10-19'), day('2026-10-24', { mode: 'replace' }), { ...day('2026-10-23'), to: '2026-10-24' }]
    const dates = (today: string) => thisWeeksDays(all, today).days.map((d) => d.date)
    expect(dates('2026-10-20')).toEqual(['2026-10-22']) // Tue: not Monday's, not next week's
    expect(dates('2026-10-22')).toEqual(['2026-10-22']) // the day itself
    expect(dates('2026-10-25')).toEqual(['2026-10-29']) // the Sunday after
    expect(thisWeeksDays(all, '2026-10-20').posts).toEqual([])
  })
  // Oct 23: BZBI's newsletter gave "Sat Oct 24, 9:30 AM" before the shul
  // had a usual Shabbos time; once it had one, This week's schedule showed
  // the usual 9:30 as this week's.
  it('a one-day time that’s just the usual one isn’t this week’s, unless the week replaces the usual times that day', () => {
    const regular: Minyan[] = [{ id: 'u', tefillah: 'shacharis', days: ['sat'], time: '9:30AM' }]
    const bzbi: SpecialSchedule = { id: 'a', name: 'Sat Oct 24', from: '2026-10-24', to: '2026-10-24', mode: 'add', minyanim: [{ id: 'm', tefillah: 'shacharis', on: ['2026-10-24'], time: '9:30 AM' }] }
    expect(thisWeeksDays([bzbi], '2026-10-23', { regular }).days).toEqual([])
    // Another time that day is still this week's.
    const later = { ...bzbi, minyanim: [...bzbi.minyanim, { id: 'k', tefillah: 'mincha' as const, on: ['2026-10-24'], time: '5:30 PM' }] }
    expect(thisWeeksDays([later], '2026-10-23', { regular }).days[0].minyanim.map((m) => m.minyan.id)).toEqual(['k'])
    // A week that replaces Shabbos with other times: the usual 9:30 is an addition then.
    const week: SpecialSchedule = { id: 'w', name: 'Shabbos', kind: 'week', from: '2026-10-23', to: '2026-10-24', mode: 'replace', minyanim: [{ id: 'x', tefillah: 'shacharis', on: ['2026-10-24'], time: '10:00 AM' }] }
    expect(thisWeeksDays([week, bzbi], '2026-10-23', { regular }).days[0].minyanim.map((m) => m.minyan.id)).toEqual(['m', 'x'])
  })
  // Oct 20: "There's only one schedule for a given week", and the
  // newsletter wins on a day the website also gives.
  it('this week’s schedule is one list: the newsletter’s day over the website’s, additions beside, a repeated time once', () => {
    const website: SpecialSchedule = {
      ...post('Times for Oct 18 – Oct 24', '2026-10-18', '2026-10-24'),
      postedBy: 'website',
      minyanim: [
        { id: 's1', tefillah: 'shacharis', on: ['2026-10-20', '2026-10-22'], time: '7:00am' },
        { id: 's2', tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '6:30pm' },
      ],
    }
    const newsletter: SpecialSchedule = { ...post('Shabbos Noach', '2026-10-23', '2026-10-24'), minyanim: [{ id: 'n1', tefillah: 'kabbalas_shabbos', on: ['2026-10-23'], time: '6:00pm' }] }
    const thursday: SpecialSchedule = { id: 't', name: 'Thu Oct 22', from: '2026-10-22', to: '2026-10-22', mode: 'add', minyanim: [{ id: 't1', tefillah: 'shacharis', on: ['2026-10-22'], time: '7:00 AM' }, { id: 't2', tefillah: 'mincha', on: ['2026-10-22'], time: '1:30pm' }] }
    const week = thisWeeksDays([newsletter, thursday, website], '2026-10-20')
    expect(week.days.map((d) => [d.date, d.minyanim.map((m) => `${m.minyan.tefillah} ${m.minyan.time} ${m.from.id}`)])).toEqual([
      ['2026-10-20', ['shacharis 7:00am Times for Oct 18 – Oct 24']],
      ['2026-10-22', ['shacharis 7:00am Times for Oct 18 – Oct 24', 'mincha 1:30pm t']],
      ['2026-10-23', ['kabbalas_shabbos 6:00pm Shabbos Noach']],
    ])
    expect(week.posts.map((p) => p.id)).toEqual(['Shabbos Noach', 'Times for Oct 18 – Oct 24'])
    // The day's times, as the listing's next minyan reads them: the same.
    expect(resolveDay([], [website, newsletter], factsFor('2026-10-23', [], '2026-10-30')).rows.map((r) => r.time)).toEqual(['6:00pm'])
    // A website week read later in the week, starting after the
    // newsletter's, still gives way to it.
    const wholeNewsletter = { ...newsletter, from: '2026-10-18' }
    const thursdayRead = { ...website, from: '2026-10-22' }
    expect(thisWeeksDays([wholeNewsletter, thursdayRead], '2026-10-22').days.map((d) => d.minyanim.map((m) => m.from.name))).toEqual([['Shabbos Noach']])
    expect(resolveDay([], [wholeNewsletter, thursdayRead], factsFor('2026-10-23', [], '2026-10-30')).rows.map((r) => r.time)).toEqual(['6:00pm'])
  })
})

// Oct 23: "Not being able to read is different than reading and confirming
// there is nothing." A calendar that is the shul's whole week (the Little
// Shul's, Leyv Ha-Ir's) posts a week as `whole`.
describe('the shul’s whole week', () => {
  const usual: Minyan[] = [m('k', 'kabbalas_shabbos', ['fri'], '6:00pm'), m('s', 'shacharis', ['sat'], '10:00am')]
  const week = (minyanim: SpecialSchedule['minyanim']): SpecialSchedule => ({ id: 'w', name: 'Times for Oct 25 – Oct 31', from: '2026-10-25', to: '2026-10-31', mode: 'replace', kind: 'week', postedBy: 'website', whole: true, minyanim })
  const on = (date: string) => factsFor(date, [], '2026-11-07')

  it('is kept through a read, and only on a week', () => {
    expect(readSchedules([week([])])[0]).toMatchObject({ whole: true })
    expect(readSchedules([{ ...week([]), kind: undefined }])[0]).not.toHaveProperty('whole')
  })

  it('a day it has nothing for has no minyan, its usual time included', () => {
    const friOnly = week([{ id: 'f', tefillah: 'kabbalas_shabbos', on: ['2026-10-30'], time: '7:30pm' }])
    expect(resolveDay(usual, [friOnly], on('2026-10-31'))).toMatchObject({ rows: [], skip: true })
    expect(resolveDay(usual, [friOnly], on('2026-10-30')).rows.map((r) => r.time)).toEqual(['7:30pm'])
    // Not whole: Shabbos keeps its usual time.
    expect(resolveDay(usual, [{ ...friOnly, whole: undefined }], on('2026-10-31'))).toMatchObject({ skip: false, posting: { kind: 'regular' } })
  })

  it('with no minyanim, no minyan this week, which isn’t the same as no week posted', () => {
    expect(thisWeeksDays([week([])], '2026-10-27')).toMatchObject({ days: [], posts: [], none: { name: 'Times for Oct 25 – Oct 31' } })
    expect(thisWeeksDays([], '2026-10-27').none).toBeNull()
    // A week that isn't the shul's whole week says nothing about the others.
    expect(thisWeeksDays([{ ...week([]), whole: undefined }], '2026-10-27').none).toBeNull()
    // Once Shabbos is over, the week ahead.
    expect(thisWeeksDays([week([])], '2026-10-24', { shabbosOver: true }).none).not.toBeNull()
    expect(thisWeeksDays([week([])], '2026-10-24').none).toBeNull()
  })

  it('says so in the admin’s summary', () => {
    expect(formatSchedulesSummary([week([])])).toContain('no minyan')
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
        // A week's minyan keeps its sign-up (Oct 23): a newsletter can say so.
        { id: 'new', tefillah: 'mincha', on: ['2026-10-09', '2026-10-10'], time: '1:30pm', signUp: { name: 'x' } },
      ],
    })
  })
})

// Oct 22: a week a calendar or newsletter gives may have the time alone,
// and the usual minyan its Zoom link.
describe('usualJoinLink', () => {
  const ZOOM = 'https://upenn.zoom.us/j/97084263584'
  const usual: Minyan[] = [{ id: 't', tefillah: 'shacharis', days: ['thu'], time: '8:10 AM', joinLink: ZOOM }]
  it('its own, else the usual minyan’s that weekday at that time', () => {
    expect(usualJoinLink(usual, { tefillah: 'shacharis', time: '8:10am', joinLink: 'https://zoom.us/j/1' }, ['thu'])).toBe('https://zoom.us/j/1')
    expect(usualJoinLink(usual, { tefillah: 'shacharis', time: '8:10am' }, ['thu'])).toBe(ZOOM)
  })
  it('not another time, day or tefillah, which may be in the room only', () => {
    expect(usualJoinLink(usual, { tefillah: 'shacharis', time: '7:00am' }, ['thu'])).toBeUndefined()
    expect(usualJoinLink(usual, { tefillah: 'shacharis', time: '8:10am' }, ['mon'])).toBeUndefined()
    expect(usualJoinLink(usual, { tefillah: 'mincha', time: '8:10am' }, ['thu'])).toBeUndefined()
    expect(usualJoinLink(usual, { tefillah: 'shacharis', time: 'At sunset' }, ['thu'])).toBeUndefined()
  })
  it('a schedule’s summary says it, for the moderator', () => {
    const week: SpecialSchedule = { id: 'w', name: 'Times for Oct 18 – Oct 24', from: '2026-10-22', to: '2026-10-24', mode: 'replace', minyanim: [{ id: 'a', tefillah: 'shacharis', on: ['2026-10-22'], time: '8:10am', joinLink: ZOOM }] }
    expect(formatSchedulesSummary([week])).toContain('Shacharis · Thu Oct 22 · 8:10am · Online: upenn.zoom.us/j/97084263584')
  })
})

// Mekor's newsletter "5:45pm Mincha followed by Maariv*" signs up in the
// group their usual weekday Maariv has (the user, Oct 23).
describe('the group a sign-up minyan signs up in', () => {
  const late = { link: 'https://chat.whatsapp.com/Late' }
  const early = { link: 'https://chat.whatsapp.com/Early' }
  const usual: Minyan[] = [
    { id: 'a', tefillah: 'maariv', days: ['mon', 'tue'], time: '8:00pm', signUp: late },
    { id: 'b', tefillah: 'mincha_maariv', days: ['wed'], time: '6:00pm', signUp: early },
    { id: 'c', tefillah: 'shacharis', days: ['mon'], time: '7:00am' },
  ]

  it('the usual same tefillah’s that day, else the same crowd’s', () => {
    expect(signUpGroup(usual, 'maariv', ['mon'])).toBe(late)
    expect(signUpGroup(usual, 'mincha_maariv', ['tue'])).toBe(late)
    expect(signUpGroup(usual, 'maariv', ['wed'])).toBe(early)
  })

  it('none that day: sign-up, with no group yet', () => {
    expect(signUpGroup(usual, 'shacharis', ['mon'])).toEqual({})
    expect(signUpGroup(usual, 'maariv', ['thu'])).toEqual({})
  })
})
