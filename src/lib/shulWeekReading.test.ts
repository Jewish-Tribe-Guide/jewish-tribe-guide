import { describe, expect, it } from 'vitest'
import { asCalendarWeek } from './shulWeekReading'
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
