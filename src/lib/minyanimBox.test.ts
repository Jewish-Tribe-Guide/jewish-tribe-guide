import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import { mergeMinyanimBox, minyanimForBox } from './minyanimBox'

const shacharis: Minyan = { id: 's', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' }
const mincha: Minyan = { id: 'm', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], time: '15 min before sunset' }
const shabbosMorning: Minyan = { id: 'sh', tefillah: 'shacharis', days: ['sat'], time: '9:15am' }
const rows = [shacharis, mincha, shabbosMorning]

describe('one box of a shul’s times (Oct 10)', () => {
  it('cuts each row to the days the box shows: Friday night is Shabbos’s, Friday’s Shacharis the week’s', () => {
    expect(minyanimForBox(rows, 'shabbos')).toEqual([{ ...mincha, days: ['fri'] }, shabbosMorning])
    expect(minyanimForBox(rows, 'weekday')).toEqual([shacharis, { ...mincha, days: ['sun', 'mon', 'tue', 'wed', 'thu'] }])
  })

  it('changes nothing when nothing in the box changed: rows stay whole', () => {
    expect(mergeMinyanimBox(rows, 'shabbos', minyanimForBox(rows, 'shabbos'))).toEqual(rows)
    expect(mergeMinyanimBox(rows, 'weekday', minyanimForBox(rows, 'weekday'))).toEqual(rows)
  })

  it('splits a row only when its part in the box changed, keeping the other days as they were', () => {
    const edited = minyanimForBox(rows, 'shabbos').map((m) => (m.id === 'm' ? { ...m, time: 'candle lighting' } : m))
    expect(mergeMinyanimBox(rows, 'shabbos', edited)).toEqual([
      shacharis,
      { ...mincha, days: ['sun', 'mon', 'tue', 'wed', 'thu'] },
      { ...mincha, id: 'm-shabbos', days: ['fri'], time: 'candle lighting' },
      shabbosMorning,
    ])
  })

  it('drops the box’s part of a row taken out, and adds a new row', () => {
    const added: Minyan = { id: 'new', tefillah: 'mincha', days: ['sat'], time: '12:20pm' }
    const edited = [...minyanimForBox(rows, 'shabbos').filter((m) => m.id !== 'sh'), added]
    expect(mergeMinyanimBox(rows, 'shabbos', edited)).toEqual([shacharis, mincha, added])
  })
})
