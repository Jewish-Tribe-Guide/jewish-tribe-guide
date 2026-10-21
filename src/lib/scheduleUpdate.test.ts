import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { applyUpdate, changesAnything, compareTimes, datesHeldOverWebsite, mergeSchedule, sameTime, seasonFromNotes, seasonOf, type ReadRegularTime, type RegularReading } from './scheduleUpdate'

// Mekor Habracha's times as the guide has them (test copy, Oct 1): the
// seasons are in the notes, not the season field.
const MEKOR: Minyan[] = [
  { id: 'm1', tefillah: 'shacharis', days: ['sat'], time: '9:15am' },
  { id: 'm2', tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 },
  { id: 'm3', tefillah: 'mincha', days: ['sat'], time: '12:20pm', notes: 'Winter only- following Kiddush' },
  { id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', notes: 'Summer only' },
  { id: 'm5', tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, notes: 'Winter only' },
]

let n = 0
const newId = () => `n${++n}`
const t = (x: Partial<ReadRegularTime> & Pick<ReadRegularTime, 'tefillah' | 'time'>): ReadRegularTime => ({ id: newId(), days: [], quote: x.time, checked: true, ...x })

// "Mekor Habracha – Winter Schedule, Starting Sunday, November 1" (an
// example message, as on the canvas).
const WINTER: RegularReading = {
  kind: 'schedule',
  complete: true,
  season: 'winter',
  title: 'Winter Schedule',
  startsOn: '2026-11-01',
  from: null,
  to: null,
  times: [
    t({ tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0 }),
    t({ tefillah: 'shacharis', days: ['sat'], time: '9:00am' }),
    t({ tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 }),
    t({ tefillah: 'shacharis', days: ['sun'], time: '8:30am' }),
    t({ tefillah: 'shacharis', days: [], date: '2026-11-26', occasion: 'Thanksgiving', time: '8:00am' }),
  ],
}

// Their WhatsApp for Shabbos Bereishis, Oct 9–10. Candle lighting 6:12 PM
// Friday, sunset 6:29 PM Shabbos (Hebcal, Philadelphia).
const BEREISHIS: RegularReading = {
  kind: 'week',
  complete: true,
  season: null,
  title: 'Shabbos Bereishis',
  startsOn: null,
  from: '2026-10-09',
  to: '2026-10-10',
  times: [
    t({ tefillah: 'mincha_maariv', date: '2026-10-09', time: '6:12pm' }),
    t({ tefillah: 'shacharis', date: '2026-10-10', time: '9:00am' }),
    t({ tefillah: 'mincha_maariv', date: '2026-10-10', time: '5:59pm' }),
  ],
}
const ZMANIM = { '2026-10-09': { sunset: 18 * 60 + 30, candleLighting: 18 * 60 + 12 }, '2026-10-10': { sunset: 18 * 60 + 29, havdalah: 19 * 60 + 9 } }

const brief = (rows: { day: string; tefillah: string; time: string; status: string; was?: string }[]) =>
  rows.map((r) => `${r.day} ${r.tefillah} ${r.time} ${r.status}${r.was ? ` was ${r.was}` : ''}`)

describe('seasons written in notes', () => {
  it('reads "Winter only" and "Summer only" as the season', () => {
    expect(seasonOf(MEKOR[2])).toBe('winter')
    expect(seasonOf(MEKOR[3])).toBe('summer')
    expect(seasonOf(MEKOR[0])).toBeUndefined()
  })
  it('sets the season and keeps the rest of the note', () => {
    expect(seasonFromNotes(MEKOR[2])).toMatchObject({ season: 'winter', notes: 'following Kiddush' })
    expect(seasonFromNotes(MEKOR[3])).toEqual({ id: 'm4', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', season: 'summer' })
    expect(seasonFromNotes(MEKOR[0])).toBe(MEKOR[0])
  })
  it('leaves a note alone when it disagrees with the season already set', () => {
    const m: Minyan = { ...MEKOR[3], season: 'winter' }
    expect(seasonFromNotes(m)).toBe(m)
  })
})

describe('the same time', () => {
  it('a clock time within 2 minutes of a rule on that date is that rule', () => {
    const cl = MEKOR[4]
    expect(sameTime(cl, { time: '6:12pm' }, ZMANIM['2026-10-09'])).toBe(true)
    expect(sameTime(cl, { time: '6:14pm' }, ZMANIM['2026-10-09'])).toBe(true)
    expect(sameTime(cl, { time: '6:15pm' }, ZMANIM['2026-10-09'])).toBe(false)
    // Without the date's zmanim, never assumed the same.
    expect(sameTime(cl, { time: '6:12pm' })).toBe(false)
  })
  it('rules are the same only with the same zman and minutes', () => {
    expect(sameTime(MEKOR[1], { time: '30 min before Sunset', anchor: 'sunset', offsetMinutes: -30 })).toBe(true)
    expect(sameTime(MEKOR[1], { time: '20 min before Sunset', anchor: 'sunset', offsetMinutes: -20 })).toBe(false)
  })
  it('clock times compare as times, however written', () => {
    expect(sameTime({ time: '9:15am' }, { time: '9:15 AM' })).toBe(true)
  })
})

describe('a website’s times for both seasons', () => {
  // Mekor's website, Oct 21: Friday "7:00 PM · Summer", "around
  // candle-lighting · Winter"; the listing, "At Candle Lighting (not after
  // 7:00 PM)". Each season's time compared in its season, and said their
  // way it's a change, not a match.
  it('compares only the season it is', () => {
    const capped: Minyan = { id: 'f', tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting (not after 7:00 PM)', anchor: 'candle_lighting', offsetMinutes: 0, notAfter: '19:00' }
    const page: RegularReading = {
      ...WINTER,
      season: null,
      complete: false,
      times: [
        t({ tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', notes: 'Summer only' }),
        t({ tefillah: 'mincha_maariv', days: ['fri'], time: '8:15 PM', notes: 'Winter only' }),
      ],
    }
    expect(brief(compareTimes([capped], page, { season: 'summer', newId }).rows)).toEqual(['fri mincha_maariv 7:00 PM changed was At Candle Lighting (not after 7:00 PM)'])
    expect(brief(compareTimes([capped], page, { season: 'winter', newId }).rows)).toEqual(['fri mincha_maariv 8:15 PM changed was At Candle Lighting (not after 7:00 PM)'])
  })

  it('a listing with both seasons’ times, as the page has them, agrees, and isn’t given the other season’s again', () => {
    const page: RegularReading = {
      ...WINTER,
      season: null,
      times: [
        t({ tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm', notes: 'Summer only' }),
        t({ tefillah: 'mincha_maariv', days: ['fri'], time: 'At Candle Lighting', anchor: 'candle_lighting', offsetMinutes: 0, notes: 'Winter only' }),
      ],
    }
    const fridays = MEKOR.filter((m) => m.days.includes('fri'))
    const u = compareTimes(fridays, page, { season: 'summer', newId })
    expect(brief(u.rows)).toEqual(['fri mincha_maariv 7:00pm same'])
    expect(changesAnything(u)).toBe(false)
  })
})

describe('a whole new winter schedule', () => {
  const u = compareTimes(MEKOR, WINTER, { season: 'summer', newId })
  it('marks each time, and leaves the summer one out', () => {
    expect(brief(u.rows)).toEqual([
      'sun shacharis 8:30am new',
      'fri mincha_maariv At Candle Lighting same',
      'sat shacharis 9:00am changed was 9:15am',
      'sat mincha 12:20pm gone',
      'sat mincha_maariv 30 min before Sunset same',
      '2026-11-26 shacharis 8:00am new',
    ])
    expect(u.otherSeason).toBe(1)
    expect(u.rows.find((r) => r.day === '2026-11-26')?.occasion).toBe('Thanksgiving')
  })

  it('applies it: winter changed, summer kept, Thanksgiving dated, seasons out of the notes', () => {
    const { minyanim, schedules, changes } = applyUpdate(MEKOR, [], u, { newId })
    const show = minyanim.map((m) => `${m.days.join(',')} ${m.tefillah} ${m.time}${m.season ? ` ${m.season}` : ''}${m.notes ? ` (${m.notes})` : ''}`).sort()
    expect(show).toEqual([
      'fri mincha_maariv 7:00pm summer',
      'fri mincha_maariv At Candle Lighting winter',
      'sat mincha_maariv 30 min before Sunset',
      'sat shacharis 9:00am winter',
      'sat shacharis 9:15am summer',
      'sun shacharis 8:30am winter',
    ])
    // Unchanged minyanim keep their ids.
    expect(minyanim.find((m) => m.time === '30 min before Sunset')?.id).toBe('m2')
    expect(schedules).toEqual([
      { id: expect.any(String), name: 'Thanksgiving', from: '2026-11-26', to: '2026-11-26', mode: 'add', minyanim: [{ id: expect.any(String), tefillah: 'shacharis', on: ['2026-11-26'], time: '8:00am' }] },
    ])
    expect(changes).toContain('Off: mincha · Shabbos · 12:20pm (for winter)')
  })

  it('a time kept stays', () => {
    const kept = { ...u, rows: u.rows.map((r) => (r.status === 'gone' ? { ...r, keep: true } : r)) }
    const { minyanim } = applyUpdate(MEKOR, [], kept, { newId })
    expect(minyanim.find((m) => m.time === '12:20pm')).toMatchObject({ season: 'winter', notes: 'following Kiddush' })
  })

  it('takes nothing off when the message is only some of their times', () => {
    const some = compareTimes(MEKOR, { ...WINTER, complete: false }, { season: 'summer', newId })
    expect(some.rows.find((r) => r.time === '12:20pm')?.status).toBe('kept')
    expect(applyUpdate(MEKOR, [], some, { newId }).minyanim.some((m) => m.time === '12:20pm')).toBe(true)
  })
})

// Mekor's newsletter for Parshat Noach (Oct 18): headed "Shabbat
// Schedule", it gave the coming week's weekday times through Friday night.
// The week was named for its heading, and read as a Shabbos.
describe('a week longer than a Shabbos', () => {
  const week: RegularReading = {
    kind: 'week',
    complete: false,
    season: null,
    title: 'Shabbat Schedule',
    startsOn: null,
    from: '2026-10-18',
    to: '2026-10-23',
    times: [
      t({ tefillah: 'shacharis', date: '2026-10-19', time: '6:45am' }),
      t({ tefillah: 'kabbalas_shabbos', date: '2026-10-23', time: '5:55pm' }),
    ],
  }
  it('goes by its dates, not its heading', () => {
    const u = compareTimes(MEKOR, week, { season: 'winter', newId })
    const { schedules, changes } = applyUpdate(MEKOR, [], u, { newId })
    expect(schedules[0]).toMatchObject({ name: 'Times for Oct 18 – Oct 23', kind: 'week' })
    expect(changes.filter((c) => c.includes(' · '))).toEqual([
      'Times for Oct 18 – Oct 23: new, shacharis · Mon Oct 19 · 6:45am',
      'Times for Oct 18 – Oct 23: new, kabbalas shabbos · Fri Oct 23 · 5:55pm',
    ])
  })
  it('a Shabbos keeps its heading', () => {
    const shabbos = { ...week, title: 'Shabbos Noach', from: '2026-10-23', to: '2026-10-24', times: [t({ tefillah: 'shacharis', date: '2026-10-24', time: '9:00am' })] }
    const { schedules } = applyUpdate(MEKOR, [], compareTimes(MEKOR, shabbos, { season: 'winter', newId }), { newId })
    expect(schedules[0].name).toBe('Shabbos Noach')
  })
})

describe('one Shabbos’s times', () => {
  const u = compareTimes(MEKOR, BEREISHIS, { season: 'summer', zmanim: ZMANIM, newId })
  it('matches clock times to the rules that day, and says what’s different', () => {
    expect(brief(u.rows)).toEqual([
      '2026-10-09 mincha_maariv 6:12pm same',
      '2026-10-09 mincha_maariv 7:00pm gone',
      '2026-10-10 shacharis 9:00am changed was 9:15am',
      '2026-10-10 mincha 12:20pm gone',
      '2026-10-10 mincha_maariv 5:59pm same',
    ])
  })

  it('this Shabbos only: a dated schedule for those two days, the regular times untouched', () => {
    const { minyanim, schedules } = applyUpdate(MEKOR, [], u, { newId, now: Date.parse('2026-10-07T15:00:00Z') })
    expect(minyanim.map((m) => m.time).sort()).toEqual(MEKOR.map((m) => m.time).sort())
    expect(schedules).toHaveLength(1)
    // Marked as a week the shul sent out, and when (Oct 6): “This week's
    // schedule”, and whether the shul sends one each week.
    expect(schedules[0]).toMatchObject({ name: 'Shabbos Bereishis', from: '2026-10-09', to: '2026-10-10', mode: 'replace', kind: 'week', postedAt: '2026-10-07T15:00:00.000Z' })
    expect(schedules[0].minyanim.map((m) => `${m.on[0]} ${m.tefillah} ${m.time}`)).toEqual([
      '2026-10-09 mincha_maariv 6:12pm',
      '2026-10-10 shacharis 9:00am',
      '2026-10-10 mincha_maariv 5:59pm',
    ])
  })

  it('their usual time now: the regular Shabbos Shacharis changes too', () => {
    const every = { ...u, rows: u.rows.map((r) => (r.status === 'changed' ? { ...r, everyWeek: true } : r)) }
    const { minyanim, changes } = applyUpdate(MEKOR, [], every, { newId })
    expect(minyanim.filter((m) => m.tefillah === 'shacharis').map((m) => m.time)).toEqual(['9:00am'])
    expect(changes[0]).toBe('Every week from now: shacharis · Shabbos · 9:00am, was 9:15am')
  })

  it('a post that matches everything changes nothing', () => {
    const same: RegularReading = { ...BEREISHIS, complete: false, times: [BEREISHIS.times[0], t({ tefillah: 'shacharis', date: '2026-10-10', time: '9:15am' })] }
    const r = compareTimes(MEKOR, same, { season: 'summer', zmanim: ZMANIM, newId })
    expect(changesAnything(r)).toBe(false)
    expect(applyUpdate(MEKOR, [], r, { newId }).schedules).toEqual([])
  })

  // The user, Oct 20, on a calendar's week: "if anything is dated it
  // should go in this week's schedule even if it fully matches usual times".
  it('a week that matches everything is posted when asked, named as asked, and says it matches', () => {
    const same: RegularReading = { ...BEREISHIS, complete: false, times: [BEREISHIS.times[0], t({ tefillah: 'shacharis', date: '2026-10-10', time: '9:15am' })] }
    const r = compareTimes(MEKOR, same, { season: 'summer', zmanim: ZMANIM, newId })
    const { schedules, changes, minyanim } = applyUpdate(MEKOR, [], r, { newId, postedBy: 'website', evenIfSame: true, name: 'Times for Oct 4 – Oct 10' })
    expect(minyanim.map((m) => m.time).sort()).toEqual(MEKOR.map((m) => m.time).sort())
    expect(schedules).toEqual([expect.objectContaining({ name: 'Times for Oct 4 – Oct 10', from: '2026-10-09', to: '2026-10-10', kind: 'week', mode: 'replace', postedBy: 'website' })])
    // The usual times it gave, and the ones it didn't mention, kept.
    expect(schedules[0].minyanim.map((m) => `${m.on[0]} ${m.tefillah} ${m.time}`)).toEqual([
      '2026-10-09 mincha_maariv 6:12pm',
      '2026-10-09 mincha_maariv 7:00pm',
      '2026-10-10 shacharis 9:15am',
      '2026-10-10 mincha 12:20pm',
      '2026-10-10 mincha_maariv 30 min before Sunset',
    ])
    expect(changes[0]).toBe('Times for Oct 4 – Oct 10: the same as their usual times, posted as this week’s schedule')
    // Nothing to post, nothing posted.
    expect(applyUpdate(MEKOR, [], { ...r, rows: [] }, { newId, evenIfSame: true }).schedules).toEqual([])
  })

  it('a week sent again replaces every day of it, a day it now has nothing for too', () => {
    const first = applyUpdate(MEKOR, [], u, { newId }).schedules
    const fridayOnly = { ...u, rows: u.rows.filter((r) => r.day === '2026-10-09' && r.status === 'same') }
    const [merged] = applyUpdate(MEKOR, first, fridayOnly, { newId, evenIfSame: true, name: 'Shabbos Bereishis' }).schedules
    expect(merged.minyanim.map((m) => `${m.on[0]} ${m.time}`)).toEqual(['2026-10-09 6:12pm'])
    expect([merged.from, merged.to]).toEqual(['2026-10-09', '2026-10-10'])
  })
})

// The user, Oct 20: the shul's website (or calendar) is read too, and
// "the newsletter wins when they disagree".
describe('a week from the website, and the newsletter’s for the same days', () => {
  const u = compareTimes(MEKOR, BEREISHIS, { season: 'summer', zmanim: ZMANIM, newId })
  const now = Date.parse('2026-10-07T15:00:00Z')
  const fromWebsite = applyUpdate(MEKOR, [], u, { newId, now, postedBy: 'website' }).schedules

  it('a week read off the website is marked so', () => {
    expect(fromWebsite).toEqual([expect.objectContaining({ kind: 'week', postedBy: 'website' })])
  })

  it('the newsletter’s week takes the website’s days off, and keeps the website’s other days', () => {
    const later: SpecialSchedule = {
      id: 'w',
      name: 'Times for Oct 10 – Oct 11',
      from: '2026-10-10',
      to: '2026-10-11',
      mode: 'replace',
      kind: 'week',
      postedBy: 'website',
      minyanim: [
        { id: 'y', tefillah: 'mincha', on: ['2026-10-10'], time: '5:00pm' },
        { id: 'z', tefillah: 'shacharis', on: ['2026-10-11'], time: '8:00am' },
      ],
    }
    const { schedules } = applyUpdate(MEKOR, [...fromWebsite, later], u, { newId, now })
    expect(schedules.map((s) => [s.name, s.postedBy ?? 'newsletter', s.from, s.minyanim.map((m) => m.on.join(','))])).toEqual([
      ['Times for Oct 10 – Oct 11', 'website', '2026-10-11', ['2026-10-11']],
      ['Shabbos Bereishis', 'newsletter', '2026-10-09', ['2026-10-09', '2026-10-10', '2026-10-10']],
    ])
  })

  it('a week from the website takes nothing off the newsletter’s', () => {
    const fromNewsletter = applyUpdate(MEKOR, [], u, { newId, now }).schedules
    expect(datesHeldOverWebsite(fromNewsletter)).toEqual(new Set(['2026-10-09', '2026-10-10']))
    expect(datesHeldOverWebsite(fromWebsite)).toEqual(new Set())
  })
})

describe('a schedule of the same name merges day by day', () => {
  const sukkos: SpecialSchedule = {
    id: 's1',
    name: 'Sukkos',
    from: '2026-09-26',
    to: '2026-10-04',
    mode: 'replace',
    minyanim: [
      { id: 'a', tefillah: 'shacharis', on: ['chol_hamoed'], time: '6:45am' },
      { id: 'b', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:00am' },
    ],
  }
  const shemini: SpecialSchedule = { id: 's2', name: 'Sukkos', from: '2026-10-03', to: '2026-10-04', mode: 'replace', minyanim: [{ id: 'c', tefillah: 'shacharis', on: ['2026-10-03'], time: '9:30am' }] }

  it('keeps the days the new one doesn’t give', () => {
    const [merged] = mergeSchedule([sukkos], shemini)
    expect(merged.id).toBe('s1')
    expect(merged.from).toBe('2026-09-26')
    expect(merged.minyanim.map((m) => `${m.on.join(',')} ${m.time}`)).toEqual(['chol_hamoed 6:45am', '2026-10-03 9:30am'])
  })

  it('takes a covered date off a day named another way', () => {
    const fri: SpecialSchedule = { ...shemini, minyanim: [{ id: 'd', tefillah: 'shacharis', on: ['2026-10-02'], time: '6:30am' }] }
    const expand = (d: string) => (d === 'chol_hamoed' ? ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'] : [d])
    const [merged] = mergeSchedule([sukkos], fri, expand)
    expect(merged.minyanim.map((m) => `${m.on.join(',')} ${m.time}`)).toEqual([
      '2026-09-28,2026-09-29,2026-09-30,2026-10-01 6:45am',
      '2026-10-03 9:00am',
      '2026-10-02 6:30am',
    ])
  })

  it('adds a schedule of a new name beside the others', () => {
    expect(mergeSchedule([sukkos], { ...shemini, name: 'Shabbos Bereishis' })).toHaveLength(2)
  })
})

// Oct 16: a minyan that only runs when enough sign up. A message gives its
// time, never how it gets its ten, so a new time for it keeps it one; and
// the same time on another day that isn't one stays its own minyan.
describe('a minyan that only runs when enough sign up', () => {
  const signUp = { link: 'https://chat.whatsapp.com/Late1' }
  const schedule = (times: ReadRegularTime[]): RegularReading => ({ kind: 'schedule', complete: true, season: null, title: 'New times', startsOn: null, from: null, to: null, times })

  it('a new time for it keeps it a sign-up minyan', () => {
    const shul: Minyan[] = [
      { id: 'r', tefillah: 'maariv', days: ['sun', 'mon'], time: '8:00pm' },
      { id: 's', tefillah: 'shacharis', days: ['sun', 'mon'], time: '6:15am', signUp },
    ]
    const u = compareTimes(shul, schedule([t({ tefillah: 'maariv', days: ['sun', 'mon'], time: '8:00pm' }), t({ tefillah: 'shacharis', days: ['sun', 'mon'], time: '6:30am' })]), { season: null, newId })
    const { minyanim } = applyUpdate(shul, [], u, { newId })
    expect(minyanim.map((m) => `${m.tefillah} ${m.days.join(',')} ${m.time}${m.signUp ? ' sign-up' : ''}`).sort()).toEqual(['maariv sun,mon 8:00pm', 'shacharis sun,mon 6:30am sign-up'])
  })

  it('is never run together with a regular minyan at the same time', () => {
    const shul: Minyan[] = [
      { id: 'r', tefillah: 'maariv', days: ['sun'], time: '8:00pm' },
      { id: 's', tefillah: 'maariv', days: ['mon'], time: '8:00pm', signUp },
    ]
    const u = compareTimes(shul, { ...schedule([t({ tefillah: 'shacharis', days: ['tue'], time: '7:00am' })]), complete: false }, { season: null, newId })
    const { minyanim } = applyUpdate(shul, [], u, { newId })
    expect(minyanim.filter((m) => m.tefillah === 'maariv').map((m) => `${m.days.join(',')}${m.signUp ? ' sign-up' : ''}`).sort()).toEqual(['mon sign-up', 'sun'])
  })
})
