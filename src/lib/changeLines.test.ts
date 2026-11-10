import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { onlyExtras, scheduleChange, usualBoxChange } from './changeLines'

const week = (id: string, from: string, to: string, minyanim: SpecialSchedule['minyanim'], extra: Partial<SpecialSchedule> = {}): SpecialSchedule => ({ id, name: 'Times', from, to, mode: 'replace', kind: 'week', minyanim, ...extra })
const flat = (g: { label: string; lines: { text: string; kind: string }[] }[]) => g.map((x) => [x.label, x.lines.map((l) => `${l.kind} ${l.text}`)])

describe('a dated schedule, day by day', () => {
  it('only the days that differ, the old above the new', () => {
    const was = week('p', '2026-10-25', '2026-10-31', [
      { id: 'a', tefillah: 'mincha', on: ['2026-10-26'], time: '4:45pm' },
      { id: 'b', tefillah: 'shacharis', on: ['2026-10-27'], time: '7:00am' },
    ])
    const now = { ...was, minyanim: [{ ...was.minyanim[0], time: '5:00pm' }, was.minyanim[1]] }
    expect(flat(scheduleChange([was], [now]))).toEqual([['Mon Oct 26', ['gone Mincha 4:45 PM', 'new Mincha 5 PM']]])
  })

  it('a new post, every day it gives', () => {
    const now = week('n', '2026-11-01', '2026-11-07', [{ id: 'a', tefillah: 'mincha', on: ['2026-11-01', '2026-11-02'], time: '4:45pm' }])
    expect(flat(scheduleChange([], [now]))).toEqual([
      ['Sun Nov 1', ['new Mincha 4:45 PM']],
      ['Mon Nov 2', ['new Mincha 4:45 PM']],
    ])
  })

  it('goes by what the listing shows: a newer post hides what an older has that day', () => {
    const old = week('o', '2026-10-25', '2026-10-31', [{ id: 'a', tefillah: 'mincha', on: ['2026-10-30'], time: '4:45pm' }])
    const now = week('n', '2026-10-30', '2026-10-31', [{ id: 'b', tefillah: 'mincha', on: ['2026-10-30'], time: '5:00pm' }])
    expect(flat(scheduleChange([old], [old, now]))).toEqual([['Fri Oct 30', ['gone Mincha 4:45 PM', 'new Mincha 5 PM']]])
  })

  it('a row that stays stays plain, and a day with no change isn’t listed', () => {
    const a = { id: 'a', tefillah: 'mincha' as const, on: ['2026-10-26'], time: '4:45pm' }
    const was = week('p', '2026-10-25', '2026-10-31', [a])
    const now = { ...was, minyanim: [a, { id: 'b', tefillah: 'maariv' as const, on: ['2026-10-26'], time: '6:00pm' }] }
    expect(flat(scheduleChange([was], [now]))).toEqual([['Mon Oct 26', ['same Mincha 4:45 PM', 'new Maariv 6 PM']]])
  })

  // Rodeph Shalom, Nov 10: its website said the note's two parts the other
  // way round, and the card crossed out the 8:10 AM Shacharis and gave it
  // again as new. The user: "don't even say the davening time is new. Make
  // it clear that the suggestion is only on the note."
  it('a note changed is one line, the time plain, saying it’s the note', () => {
    const zoom = 'https://upenn.zoom.us/j/97084263584'
    const was = week('p', '2026-11-08', '2026-11-14', [
      { id: 'a', tefillah: 'shacharis', on: ['2026-11-12'], time: '8:10 AM', notes: 'Online; until 8:40 AM', joinLink: zoom },
      { id: 'b', tefillah: 'kabbalas_shabbos', on: ['2026-11-13'], time: '6:00pm', notes: 'until 7:30 PM' },
    ], { whole: true })
    const now = { ...was, minyanim: [{ ...was.minyanim[0], id: 'x', notes: 'until 8:40 AM; Online' }, { ...was.minyanim[1], id: 'y' }] }
    const days = scheduleChange([was], [now])
    expect(flat(days)).toEqual([['Thu Nov 12', ['same Shacharis 8:10 AM']]])
    expect(days[0].lines[0].extras).toEqual({ says: 'Note changed', was: 'Online; until 8:40 AM', now: 'Until 8:40 AM; Online' })
    expect(onlyExtras(days)).toBe(true)
    // A time changed is still the old above the new.
    const later = { ...was, minyanim: [{ ...was.minyanim[0], time: '8:30 AM', notes: 'until 9 AM' }, was.minyanim[1]] }
    expect(flat(scheduleChange([was], [later]))).toEqual([['Thu Nov 12', ['gone Shacharis 8:10 AM', 'new Shacharis 8:30 AM']]])
    expect(onlyExtras(scheduleChange([was], [later]))).toBe(false)
  })

  it('nothing to list when no date’s times differ', () => {
    const was = week('p', '2026-10-25', '2026-10-31', [])
    expect(scheduleChange([was], [{ ...was, whole: true }])).toEqual([])
  })
})

describe('a usual box', () => {
  const r = (id: string, time: string, over: Partial<Minyan> = {}): Minyan => ({ id, tefillah: 'shacharis', days: ['mon'], time, ...over })

  it('a changed row is the old above the new, under its heading', () => {
    expect(flat(usualBoxChange([r('a', '7:00am')], [r('a', '7:30am')], 'weekday'))).toEqual([['Shacharis', ['gone Shacharis 7 AM', 'new Shacharis 7:30 AM']]])
  })

  it('the same words are the same row, whatever its id', () => {
    expect(flat(usualBoxChange([r('a', '7:00am')], [r('z', '7:00am')], 'weekday'))).toEqual([['Shacharis', ['same Shacharis 7 AM']]])
  })

  it('a note added is one line, saying so', () => {
    const lines = usualBoxChange([r('a', '7:00am')], [r('a', '7:00am', { notes: 'In the chapel' })], 'weekday')
    expect(flat(lines)).toEqual([['Shacharis', ['same Shacharis 7 AM']]])
    expect(lines[0].lines[0].extras).toEqual({ says: 'Note added', now: 'In the chapel' })
    // Another day is not a note.
    expect(flat(usualBoxChange([r('a', '7:00am')], [r('a', '7:00am', { days: ['tue'], notes: 'x' })], 'weekday'))).toEqual([['Shacharis', ['gone Shacharis 7 AM', 'new Shacharis 7 AM']]])
  })

  it('one taken out is crossed out; one added is new', () => {
    expect(flat(usualBoxChange([r('a', '7:00am')], [r('b', '8:00am', { tefillah: 'mincha' })], 'weekday'))).toEqual([
      ['Shacharis', ['gone Shacharis 7 AM']],
      ['Mincha', ['new Mincha 8 AM']],
    ])
  })
})
