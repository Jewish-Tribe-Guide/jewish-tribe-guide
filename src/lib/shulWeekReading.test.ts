import { describe, expect, it } from 'vitest'
import { asCalendarWeek, datedAsWeeks } from './shulWeekReading'
import type { ReadRegularTime, RegularReading } from './scheduleUpdate'

const time = (x: Partial<ReadRegularTime>): ReadRegularTime => ({ id: x.date ?? 'w', tefillah: 'shacharis', days: [], time: '8:10am', quote: '8:10 AM', checked: true, ...x })

// The user, Oct 20: a calendar's week is that week's schedule ("if we have
// the schedule for the week then it's not usual times"), whatever the AI
// called what it read.
describe('asCalendarWeek', () => {
  it('is that week, every minyan in it, only its own dates', () => {
    const read: RegularReading = {
      kind: 'schedule',
      complete: false,
      season: 'winter',
      title: 'Winter Schedule',
      startsOn: '2026-11-01',
      from: null,
      to: null,
      times: [time({ date: '2026-10-22' }), time({ date: '2026-10-29' }), time({ days: ['thu'] }), time({ date: '2026-10-24', tefillah: 'mincha' })],
    }
    expect(asCalendarWeek(read, { from: '2026-10-22', to: '2026-10-24' })).toEqual({
      kind: 'week',
      complete: true,
      season: null,
      title: null,
      startsOn: null,
      from: '2026-10-22',
      to: '2026-10-24',
      times: [time({ date: '2026-10-22' }), time({ date: '2026-10-24', tefillah: 'mincha' })],
    })
  })
})

// The user, Oct 21, on Mikveh Israel's home page, read as "Shabbat Lekh
// Lekha · Oct 23 – Oct 23 · as well as the regular times": "If we have
// specific dates then it should all go on this week, no?"
describe('datedAsWeeks', () => {
  const page = (times: ReadRegularTime[]): RegularReading => ({ kind: 'schedule', complete: false, season: null, title: null, startsOn: null, from: null, to: null, times })
  const usual = [time({ days: ['mon', 'thu'], time: '7:15am' }), time({ tefillah: 'mincha', days: ['mon', 'tue', 'wed', 'thu'], time: '2:00pm' })]
  const lekhLekha = time({ tefillah: 'kabbalas_shabbos', date: '2026-10-23', occasion: 'Shabbat Lekh Lekha', time: '6:00pm' })

  it('gives a page’s dated times as their week’s schedule, to that Shabbos, apart from its usual times', () => {
    expect(datedAsWeeks(page([...usual, lekhLekha]))).toEqual({
      usual: page(usual),
      weeks: [{ kind: 'week', complete: false, season: null, title: 'Shabbat Lekh Lekha', startsOn: null, from: '2026-10-23', to: '2026-10-24', times: [lekhLekha] }],
    })
  })

  it('one week each, from its first date; named only when its times share one occasion', () => {
    const thu = time({ date: '2026-10-22' })
    const nextFri = time({ tefillah: 'kabbalas_shabbos', date: '2026-10-30', time: '5:45pm' })
    const { usual: left, weeks } = datedAsWeeks(page([nextFri, lekhLekha, thu]))
    expect(left).toBeNull()
    expect(weeks.map((w) => [w.from, w.to, w.title, w.times.length])).toEqual([
      ['2026-10-22', '2026-10-24', null, 2],
      ['2026-10-30', '2026-10-31', null, 1],
    ])
  })

  it('leaves a page with no dates, and a week as read, as they are', () => {
    expect(datedAsWeeks(page(usual))).toEqual({ usual: page(usual), weeks: [] })
    const week: RegularReading = { ...page([lekhLekha]), kind: 'week', from: '2026-10-23', to: '2026-10-24' }
    expect(datedAsWeeks(week)).toEqual({ usual: week, weeks: [] })
  })
})
