import { describe, expect, it, vi } from 'vitest'
import type { Festival } from './festivals'
import { asRegularTime, readRegular, readSchedule, readSunsetTime, readZmanTime, regularMessages, scheduleMessages, tidyRegularReading, tidyScheduleReading } from './scheduleReader'

const sukkos: Festival = {
  festival: 'Sukkos',
  name: 'Sukkos 5787',
  from: '2026-09-26',
  to: '2026-10-04',
  days: [
    { date: '2026-09-26', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
    { date: '2026-09-27', yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' },
    { date: '2026-09-28', yomTov: false, cholHamoed: true, name: 'Chol HaMoed', festival: 'Sukkos' },
    { date: '2026-10-02', yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: 'Sukkos' },
    { date: '2026-10-04', yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' },
  ],
}
const text = 'Yom Tov (Sat 9/26, Sun 9/27): Shacharis 9:00, Mincha 6:35\nChol HaMoed: Mincha/Maariv 6:30\nSimchas Torah: Hakafos after Maariv 7:30'
let n = 0
const id = () => `id${++n}`

describe('what the AI read, kept to what holds up', () => {
  it('keeps a time with its words from the message, on the festival’s days, named and dated as the festival is', () => {
    const r = tidyScheduleReading(
      {
        times: [
          { tefillah: 'shacharis', on: ['2026-09-26', '2026-09-27'], time: '9:00am', quote: 'Shacharis 9:00' },
          { tefillah: 'mincha_maariv', on: ['chol_hamoed'], time: '6:30pm', quote: 'Mincha/Maariv 6:30' },
          { tefillah: 'other', on: ['2026-10-04'], time: '7:30pm', notes: 'Hakafos', quote: 'Hakafos after Maariv 7:30', unsure: 'Is 7:30 Maariv or Hakafos?' },
        ],
        missing: 'No Mincha on Simchas Torah.',
      },
      sukkos,
      { text },
      id,
    )
    expect(r.schedule).toMatchObject({ name: 'Sukkos 5787', from: '2026-09-26', to: '2026-10-04', mode: 'replace' })
    expect(r.schedule.minyanim.map((m) => [m.tefillah, m.on, m.time])).toEqual([
      ['shacharis', ['2026-09-26', '2026-09-27'], '9:00am'],
      ['mincha_maariv', ['chol_hamoed'], '6:30pm'],
      ['other', ['2026-10-04'], '7:30pm'],
    ])
    expect(r.times[2]).toMatchObject({ quote: 'Hakafos after Maariv 7:30', checked: true, unsure: 'Is 7:30 Maariv or Hakafos?' })
    // What goes on the listing carries no reading bookkeeping.
    expect(Object.keys(r.schedule.minyanim[2]).sort()).toEqual(['id', 'notes', 'on', 'tefillah', 'time'])
    expect(r.missing).toBe('No Mincha on Simchas Torah.')
  })

  it('drops a time whose words aren’t in the message: the message doesn’t say it', () => {
    const r = tidyScheduleReading({ times: [{ tefillah: 'maariv', on: ['yom_tov'], time: '7:40pm', quote: 'Maariv 7:40' }] }, sukkos, { text }, id)
    expect(r.times).toEqual([])
  })

  it('drops days that aren’t the festival’s, and a time with none left; and an unknown tefillah', () => {
    const r = tidyScheduleReading(
      {
        times: [
          { tefillah: 'shacharis', on: ['2026-12-25'], time: '9:00am', quote: 'Shacharis 9:00' },
          { tefillah: 'shacharis', on: ['2026-09-26', 'someday'], time: '9:00am', quote: 'Shacharis 9:00' },
          { tefillah: 'mussaf', on: ['2026-09-26'], time: '10:30am', quote: 'Shacharis 9:00' },
        ],
      },
      sukkos,
      { text },
      id,
    )
    expect(r.times.map((t) => t.on)).toEqual([['2026-09-26']])
  })

  it('a time from sunset becomes one the guide works out each day; anything else is kept as written', () => {
    // Before, "10 min before sunset" went in as words: never a time, so the
    // row never showed, and nothing said so.
    const msg = 'Mincha 10 min before sunset\nMaariv at shkia\nKabbalas Shabbos at candle lighting\nShacharis sunset'
    const r = tidyScheduleReading(
      {
        times: [
          { tefillah: 'mincha', on: ['chol_hamoed'], time: '10 min before sunset', quote: 'Mincha 10 min before sunset' },
          { tefillah: 'maariv', on: ['chol_hamoed'], time: 'at shkia', quote: 'Maariv at shkia' },
          { tefillah: 'kabbalas_shabbos', on: ['2026-10-02'], time: 'at candle lighting', quote: 'Kabbalas Shabbos at candle lighting' },
          { tefillah: 'shacharis', on: ['2026-09-26'], time: 'sunset', quote: 'Shacharis sunset' },
        ],
      },
      sukkos,
      { text: msg },
      id,
    )
    expect(r.schedule.minyanim.map((m) => [m.tefillah, m.time, m.anchor, m.offsetMinutes])).toEqual([
      ['mincha', '10 min before Sunset', 'sunset', -10],
      ['maariv', 'At Sunset', 'sunset', 0],
      ['kabbalas_shabbos', 'at candle lighting', undefined, undefined],
      ['shacharis', 'sunset', undefined, undefined],
    ])
    // The editor says the last two can't be shown (SchedulesInput's test).
  })

  it('reads minutes from sunset however they’re written', () => {
    expect(readSunsetTime('15 minutes after Sunset')).toBe(15)
    expect(readSunsetTime('20 min. prior to shkiah')).toBe(-20)
    expect(readSunsetTime("5 min before sh'kia")).toBe(-5)
    expect(readSunsetTime('Sundown')).toBe(0)
    expect(readSunsetTime('6:30pm')).toBeNull()
    expect(readSunsetTime('after sunset')).toBeNull()
    // A hedge in front is the rule all the same (Mekor Habracha's page).
    expect(readSunsetTime('around 15 minutes before sunset')).toBe(-15)
    expect(readSunsetTime('~20 min before sundown')).toBe(-20)
    expect(readSunsetTime('approx. 10 minutes after shkiah')).toBe(10)
  })

  it('from a photo, nothing to check the words against: kept, and marked so', () => {
    const r = tidyScheduleReading({ times: [{ tefillah: 'shacharis', on: ['2026-09-26'], time: '9:00am', quote: 'Shacharis 9' }] }, sukkos, { image: 'x', mime: 'image/png' }, id)
    expect(r.times[0].checked).toBe(false)
  })

  it('tells the AI the festival’s real days, and sends a photo as a photo', () => {
    const [system] = scheduleMessages({ text }, sukkos, 'Kesher Israel') as { content: string }[]
    expect(system.content).toContain('2026-10-02 (Fri Oct 2): Hoshana Rabbah, Chol HaMoed')
    // The night a day begins is the calendar date before it (seen on dev:
    // "Shemini Atzeres (Fri night Oct 2): Mincha" read onto Sat Oct 3).
    expect(system.content).toMatch(/calendar days, midnight to midnight/)
    const [, user] = scheduleMessages({ image: 'AAAA', mime: 'image/jpeg' }, sukkos, 'Kesher Israel') as { content: { type: string }[] }[]
    expect(user.content.map((c) => c.type)).toEqual(['text', 'image_url'])
  })

  it('asks the model and tidies its answer, never echoing its error', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ times: [{ tefillah: 'mincha', on: ['2026-09-26'], time: '6:35pm', quote: 'Mincha 6:35' }] }) } }] })))
    expect((await readSchedule({ text }, sukkos, 'K', { apiKey: 'k', fetchImpl: ok, newId: id })).times).toHaveLength(1)
    const bad = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-abc***' } }), { status: 401 }))
    await expect(readSchedule({ text }, sukkos, 'K', { apiKey: 'k', fetchImpl: bad })).rejects.toThrow(/^Schedule reader: 401$/)
  })
})

// ── A shul's regular times ──────────────────────────────────────────────────

const DAYS = {
  today: '2026-10-08',
  days: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date) => ({ date, names: date === '2026-10-10' ? ['Parashat Bereshit'] : [] })),
}
const POST = 'Shabbos Bereishis\nCandle lighting 6:12\nMincha/Maariv 6:12\nShacharis 9:00\nMincha/Maariv 5:59\nShabbos ends 7:09'

describe('reading a shul’s regular times', () => {
  it('tells the AI the dates ahead and what they’re called', () => {
    const [system] = regularMessages({ text: POST }, DAYS, 'Mekor Habracha') as { content: string }[]
    expect(system.content).toContain('2026-10-10 (Sat Oct 10): Parashat Bereshit')
    expect(system.content).toContain('Today is 2026-10-08')
  })

  it('reads a message sent days ago from the day it was sent, and keeps none of its past times', () => {
    // Sent Fri Oct 9, read Sun Oct 11: its "this Shabbos" was yesterday.
    const late = { today: '2026-10-11', sentOn: '2026-10-09', days: DAYS.days.slice(1) }
    const [system] = regularMessages({ text: POST }, late, 'Mekor Habracha') as { content: string }[]
    expect(system.content).toContain('the message was sent on 2026-10-09 (Fri Oct 9)')
    expect(system.content).toContain('2026-10-10 (Sat Oct 10): Parashat Bereshit')
    const r = tidyRegularReading(
      {
        kind: 'week',
        from: '2026-10-09',
        to: '2026-10-10',
        times: [
          { tefillah: 'mincha_maariv', date: '2026-10-09', time: '6:12', quote: 'Mincha/Maariv 6:12' },
          { tefillah: 'shacharis', date: '2026-10-10', time: '9:00', quote: 'Shacharis 9:00' },
        ],
      },
      { text: POST },
      late,
      id,
    )
    expect(r.times).toEqual([])
    expect(r.kind).toBe('schedule')
  })

  it('reads a Shabbos post as that weekend, with bare times as the tefillah means them', () => {
    const r = tidyRegularReading(
      {
        kind: 'week',
        complete: true,
        title: 'Shabbos Bereishis',
        from: '2026-10-09',
        to: '2026-10-10',
        times: [
          { tefillah: 'mincha_maariv', date: '2026-10-09', time: '6:12', quote: 'Mincha/Maariv 6:12' },
          { tefillah: 'shacharis', date: '2026-10-10', time: '9:00', quote: 'Shacharis 9:00' },
          { tefillah: 'mincha_maariv', date: '2026-10-10', time: '5:59', quote: 'Mincha/Maariv 5:59' },
          // Not in the message: dropped.
          { tefillah: 'maariv', date: '2026-10-10', time: '7:20', quote: 'Maariv 7:20' },
        ],
      },
      { text: POST },
      DAYS,
      id,
    )
    expect(r).toMatchObject({ kind: 'week', complete: true, from: '2026-10-09', to: '2026-10-10', title: 'Shabbos Bereishis', season: null })
    expect(r.times.map((t) => `${t.date} ${t.tefillah} ${t.time}`)).toEqual([
      '2026-10-09 mincha_maariv 6:12pm',
      '2026-10-10 shacharis 9:00am',
      '2026-10-10 mincha_maariv 5:59pm',
    ])
  })

  it('reads a winter schedule: weekdays, rules from a zman, a one-off on its date', () => {
    const msg = 'Winter Schedule\nFriday: Mincha/Maariv at candle lighting\nShabbos: Shacharis 9:00am · Mincha/Maariv 30 min before shkiah\nThanksgiving, Thu Nov 26: Shacharis 8:00am'
    const days = DAYS
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        complete: true,
        season: 'winter',
        times: [
          { tefillah: 'mincha_maariv', days: ['fri'], time: 'at candle lighting', quote: 'Mincha/Maariv at candle lighting' },
          { tefillah: 'mincha_maariv', days: ['sat'], time: '30 min before shkiah', quote: 'Mincha/Maariv 30 min before shkiah' },
          { tefillah: 'shacharis', days: ['thu'], date: '2026-11-26', occasion: 'Thanksgiving', time: '8:00am', quote: 'Thu Nov 26: Shacharis 8:00am' },
          { tefillah: 'shacharis', days: ['funday'], time: '9:00am', quote: 'Shacharis 9:00am' },
        ],
      },
      { text: msg },
      days,
      id,
    )
    expect(r).toMatchObject({ kind: 'schedule', season: 'winter', from: null, to: null })
    expect(r.times.map((t) => [t.days, t.date, t.time, t.anchor, t.offsetMinutes, t.occasion])).toEqual([
      [['fri'], undefined, 'At Candle Lighting', 'candle_lighting', 0, undefined],
      [['sat'], undefined, '30 min before Sunset', 'sunset', -30, undefined],
      [[], '2026-11-26', '8:00am', undefined, undefined, 'Thanksgiving'],
    ])
  })

  it('reads the same time given twice as one, on every day either gives', () => {
    const page = { text: 'Shabbat morning 10am\nShacharis: Shabbos 10 am, Sunday 10am' }
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        times: [
          { tefillah: 'shacharis', days: ['sat'], time: '10am', quote: 'Shabbat morning 10am' },
          { tefillah: 'shacharis', days: ['sat', 'sun'], time: '10 am', quote: 'Shacharis: Shabbos 10 am, Sunday 10am' },
        ],
      },
      page,
      DAYS,
      id,
    )
    expect(r.times).toHaveLength(1)
    expect(r.times[0]).toMatchObject({ time: '10:00am', days: ['sat', 'sun'] })
  })

  // The Oct 21 shul pages dry run: what a website says that isn't a weekly
  // minyan, read as one.
  it('leaves out what isn’t the shul’s weekly davening: a monthly service, a call, a class', () => {
    const page = {
      text: [
        'Once per month on Fridays at 5:45 pm and once per month on Saturdays at 11:15 am, we hold a Young Families Shabbat service.',
        'Daily at 1:00 PM; to participate, dial (773) 377-9170.',
        'Join Rabbi Gotlib Tuesdays at 7:00 PM for a study of Pathways to God.',
        'Kabbalat Shabbat Fridays 6:00pm',
      ].join('\n'),
    }
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        times: [
          { tefillah: 'other', days: ['fri'], time: '5:45 pm', notes: 'Young Families Shabbat service', quote: 'Once per month on Fridays at 5:45 pm' },
          { tefillah: 'other', days: ['sat'], time: '11:15 am', notes: 'Young Families Shabbat service', quote: 'once per month on Saturdays at 11:15 am' },
          { tefillah: 'other', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], time: '1:00 PM', notes: 'Tehillim', quote: 'Daily at 1:00 PM' },
          { tefillah: 'other', days: ['tue'], time: '7:00 PM', notes: 'Study with Rabbi Gotlib', quote: 'Tuesdays at 7:00 PM' },
          { tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm', quote: 'Kabbalat Shabbat Fridays 6:00pm' },
        ],
      },
      page,
      DAYS,
      id,
    )
    expect(r.times.map((t) => `${t.tefillah} ${t.time}`)).toEqual(['kabbalas_shabbos 6:00pm'])
    // And the AI is told so.
    const [system] = regularMessages(page, DAYS, 'Mekor Habracha') as { content: string }[]
    expect(system.content).toMatch(/not held every week[^\n]*leave it out/)
  })

  it('a time given as a range is its start (Kesher’s “8:00 AM – 8:40 AM”)', () => {
    expect(asRegularTime('shacharis', '8:00 AM – 8:40 AM')).toEqual({ time: '8:00 AM' })
    expect(asRegularTime('kabbalas_shabbos', '6:00-7:15 pm')).toEqual({ time: '6:00pm' })
    expect(asRegularTime('shacharis', '9:30 – 10:30am')).toEqual({ time: '9:30am' })
    expect(asRegularTime('mincha', '11:30 to 1:00 pm')).toEqual({ time: '11:30am' })
    expect(asRegularTime('mincha', '12:30 until 1:00pm')).toEqual({ time: '12:30pm' })
  })

  it('asks for a time given for one season to say so (Mekor’s “7:00 PM · Summer”)', () => {
    const [system] = regularMessages({ text: POST }, DAYS, 'Mekor Habracha') as { content: string }[]
    expect(system.content).toContain('"season": "summer" or "winter" for a time held in one season only')
    expect(system.content).toContain('A minyan with a summer time and a winter time is two entries')
  })

  // Mekor's website, Oct 21: Friday night "7:00 PM" in summer, "around
  // candle-lighting" in winter.
  const FRIDAY = 'Friday: Mincha / Kabbalat Shabbat / Ma’ariv 7:00 PM (Summer); around candle-lighting (Winter)'
  it('puts a time’s season in its note, where the guide reads it', () => {
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        times: [
          { tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', season: 'summer', quote: 'Ma’ariv 7:00 PM (Summer)' },
          { tefillah: 'mincha_maariv', days: ['fri'], time: 'around candle-lighting', season: 'winter', notes: 'with Kabbalat Shabbat', quote: 'around candle-lighting (Winter)' },
          { tefillah: 'shacharis', days: ['sat'], time: '9:15am', season: 'spring', quote: 'Kabbalat Shabbat' },
        ],
      },
      { text: FRIDAY },
      DAYS,
      id,
    )
    expect(r.times.map((t) => [t.time, t.anchor ?? null, t.notes ?? null])).toEqual([
      ['7:00 PM', null, 'Summer only'],
      ['At Candle Lighting', 'candle_lighting', 'Winter only- with Kabbalat Shabbat'],
      ['9:15am', null, null],
    ])
  })

  it('reads one Friday night minyan as one, however the AI splits it (Mekor, Oct 21)', () => {
    const at7 = (tefillah: string, season = 'summer') => ({ tefillah, days: ['fri'], time: '7:00 PM', season, quote: 'Ma’ariv 7:00 PM (Summer)' })
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        times: [
          at7('mincha'),
          at7('kabbalas_shabbos'),
          at7('maariv'),
          at7('kabbalas_shabbos', 'winter'),
        ],
      },
      { text: FRIDAY },
      DAYS,
      id,
    )
    expect(r.times.map((t) => `${t.days.join(',')} ${t.tefillah} ${t.notes ?? ''}`)).toEqual([
      'fri mincha_maariv Summer only- with Kabbalas Shabbos',
      'fri kabbalas_shabbos Winter only',
    ])
  })

  it('keeps the same time in two seasons as two times', () => {
    const r = tidyRegularReading(
      {
        kind: 'schedule',
        times: [
          { tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', season: 'summer', quote: 'Ma’ariv 7:00 PM (Summer)' },
          { tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', season: 'winter', quote: 'Ma’ariv 7:00 PM (Summer)' },
        ],
      },
      { text: FRIDAY },
      DAYS,
      id,
    )
    expect(r.times.map((t) => t.notes)).toEqual(['Summer only', 'Winter only'])
  })

  it('a "week" with no dates it can place is read as a schedule', () => {
    const r = tidyRegularReading({ kind: 'week', times: [{ tefillah: 'shacharis', days: ['sat'], time: '9:00am', quote: 'Shacharis 9:00' }] }, { text: POST }, DAYS, id)
    expect(r.kind).toBe('schedule')
  })

  it('knows the zmanim a time can be set from', () => {
    expect(readZmanTime('10 min after candle lighting')).toEqual({ anchor: 'candle_lighting', offsetMinutes: 10 })
    expect(readZmanTime('At Havdalah')).toEqual({ anchor: 'havdalah', offsetMinutes: 0 })
    expect(readZmanTime('15 minutes before shkia')).toEqual({ anchor: 'sunset', offsetMinutes: -15 })
    expect(readZmanTime('after kiddush')).toBeNull()
    expect(readZmanTime('about 18 min before candle lighting')).toEqual({ anchor: 'candle_lighting', offsetMinutes: -18 })
    // Only tefillos that move with a zman.
    expect(asRegularTime('shacharis', 'at candle lighting')).toEqual({ time: 'at candle lighting' })
    expect(asRegularTime('maariv', '12:30')).toEqual({ time: '12:30' })
    // The hour alone, as the guide writes it (Kol Tzedek's "10 am").
    expect(asRegularTime('shacharis', '10 am')).toEqual({ time: '10:00am' })
    expect(asRegularTime('maariv', '9 P.M.')).toEqual({ time: '9:00pm' })
    expect(asRegularTime('mincha_maariv', 'around candle-lighting')).toMatchObject({ anchor: 'candle_lighting', offsetMinutes: 0 })
  })

  it('asks the model and tidies its answer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ kind: 'schedule', times: [{ tefillah: 'shacharis', days: ['sat'], time: '9:00', quote: 'Shacharis 9:00' }] }) } }] }))
    const r = await readRegular({ text: POST }, DAYS, 'Mekor Habracha', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch, newId: id })
    expect(r.times[0]).toMatchObject({ days: ['sat'], time: '9:00am' })
  })
})
