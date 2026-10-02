import { describe, expect, it, vi } from 'vitest'
import type { Festival } from './festivals'
import { readSchedule, readSunsetTime, scheduleMessages, tidyScheduleReading } from './scheduleReader'

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
