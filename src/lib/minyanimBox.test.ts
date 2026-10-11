import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import { BOX_DAYS, boxChangeCount, mergeMinyanimBox, minyanimForBox } from './minyanimBox'
import { boxGroups } from './minyanText'

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

describe('the box as a list (Oct 10, canvas page “Minyan edit”)', () => {
  it('Shabbos in the order it happens: Friday night, morning, afternoon', () => {
    const afternoon: Minyan = { id: 'a', tefillah: 'mincha', days: ['sat'], time: '5:30pm' }
    const groups = boxGroups([afternoon, ...minyanimForBox(rows, 'shabbos')], 'shabbos')
    expect(groups.map((g) => [g.label, g.rows.map((m) => m.id)])).toEqual([
      ['Friday night', ['m']],
      ['Shabbos morning', ['sh']],
      ['Afternoon', ['a']],
    ])
  })

  it('the week by tefillah, each in the order of its first day', () => {
    const sunday: Minyan = { id: 'sun', tefillah: 'shacharis', days: ['sun'], time: '8:30am' }
    const groups = boxGroups([...minyanimForBox(rows, 'weekday'), sunday], 'weekday')
    expect(groups.map((g) => [g.label, g.rows.map((m) => m.id)])).toEqual([
      ['Shacharis', ['sun', 's']],
      ['Mincha & Maariv', ['m']],
    ])
  })

  it('counts each minyan changed, added or taken out, and an emptied note as no change', () => {
    const was = minyanimForBox(rows, 'shabbos')
    expect(boxChangeCount(was, was)).toBe(0)
    expect(boxChangeCount(was, was.map((m) => ({ ...m, notes: undefined })))).toBe(0)
    const changed = was.map((m) => (m.id === 'sh' ? { ...m, time: '9:30am' } : m))
    expect(boxChangeCount(was, changed)).toBe(1)
    expect(boxChangeCount(was, [...changed.filter((m) => m.id !== 'm'), { id: 'n', tefillah: 'mincha', days: ['sat'], time: '12:20pm' }])).toBe(3)
  })
})

describe('Yom Tov is in neither usual box (the user, Oct 10): its dated schedule has it', () => {
  it('neither box shows or offers Yom Tov', () => {
    const row: Minyan = { id: 'y', tefillah: 'shacharis', days: ['mon', 'sat', 'yom_tov'], time: '7:00am' }
    expect(minyanimForBox([row], 'shabbos')).toEqual([{ ...row, days: ['sat'] }])
    expect(minyanimForBox([row], 'weekday')).toEqual([{ ...row, days: ['mon'] }])
    expect(BOX_DAYS.shabbos.choices).not.toContain('yom_tov')
    expect(BOX_DAYS.weekday.choices).not.toContain('yom_tov')
  })

  it('saving a box keeps a row’s Yom Tov days', () => {
    const row: Minyan = { id: 'y', tefillah: 'shacharis', days: ['mon', 'yom_tov'], time: '7:00am' }
    const merged = mergeMinyanimBox([row], 'weekday', [{ ...row, days: ['mon'], time: '7:15am' }])
    expect(merged).toEqual([
      { ...row, days: ['yom_tov'] },
      { ...row, id: 'y-weekday', days: ['mon'], time: '7:15am' },
    ])
  })
})
