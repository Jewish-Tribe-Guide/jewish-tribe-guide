import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import { clockMinutes, noteText, shabbosList, timeText, weekdayTable } from './weekTable'

let n = 0
const m = (over: Partial<Minyan>): Minyan => ({ id: `m${n++}`, tefillah: 'shacharis', days: [], time: '', ...over })
const sunset = (offsetMinutes: number, over: Partial<Minyan> = {}): Partial<Minyan> => ({ anchor: 'sunset', offsetMinutes, time: `${Math.abs(offsetMinutes)} min before Sunset`, ...over })

// Production's times, Oct 6.
const lowerMerion = [
  m({ days: ['sun'], time: '7:30am' }),
  m({ days: ['sun'], time: '8:30am' }),
  m({ days: ['mon', 'thu'], time: '6:45am' }),
  m({ days: ['tue', 'wed', 'fri'], time: '7:00am' }),
  m({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '8:00am' }),
  m({ tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], ...sunset(-10) }),
]
const mekor = [
  m({ days: ['sat'], time: '9:15am' }),
  m({ tefillah: 'mincha_maariv', days: ['sat'], ...sunset(-30) }),
  m({ tefillah: 'mincha', days: ['sat'], time: '12:20pm', season: 'winter', notes: 'following Kiddush' }),
  m({ tefillah: 'mincha_maariv', days: ['fri'], anchor: 'candle_lighting', offsetMinutes: 0, notAfter: '7:00 PM', time: 'At Candle Lighting (not after 7:00 PM)' }),
  m({ days: ['sun', 'holiday'], time: '8:30am', notes: 'Followed by bagels, lox, and Torah' }),
  m({ tefillah: 'maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '6:30pm', season: 'winter' }),
  m({ tefillah: 'mincha_maariv', days: ['sun', 'wed', 'mon', 'tue', 'thu'], ...sunset(-15), season: 'summer' }),
  m({ days: ['mon', 'thu', 'rosh_chodesh'], time: '6:45am' }),
  m({ days: ['tue', 'wed', 'fri'], time: '6:55am' }),
]

describe('the usual weekday times, as one table', () => {
  it('puts days with the same times on one row, so nobody works out overlapping lists (Lower Merion)', () => {
    const t = weekdayTable(lowerMerion, 'summer')!
    expect(t.columns).toEqual(['shacharis', 'mincha_maariv'])
    expect(t.rows.map((r) => [r.label, ...r.cells])).toEqual([
      ['Sun', '7:30, 8:30 AM', '10 min before sunset'],
      ['Mon, Thu', '6:45, 8 AM', '10 min before sunset'],
      ['Tue, Wed', '7, 8 AM', '10 min before sunset'],
      ['Fri', '7, 8 AM', '—'],
    ])
    expect(t.rules.map((r) => r.text)).toEqual(['10 min before sunset'])
  })

  it('this season’s only, the other in one line; notes and extra days under the table (Mekor Habracha)', () => {
    const t = weekdayTable(mekor, 'summer')!
    expect(t.rows.map((r) => [r.label, ...r.cells])).toEqual([
      ['Sun', '8:30 AM', '15 min before sunset'],
      ['Mon, Thu', '6:45 AM', '15 min before sunset'],
      ['Tue, Wed', '6:55 AM', '15 min before sunset'],
      ['Fri', '6:55 AM', '—'],
    ])
    expect(t.otherSeason).toBe('In winter, Maariv 6:30 PM, Sun–Thu.')
    expect(t.notes).toEqual([
      'Sun Shacharis: followed by bagels, lox, and Torah.',
      'Shacharis 8:30 AM also on public holidays.',
      'Shacharis 6:45 AM also on Rosh Chodesh.',
    ])
    // In winter, the other way round.
    const w = weekdayTable(mekor, 'winter')!
    expect(w.columns).toEqual(['shacharis', 'maariv'])
    expect(w.otherSeason).toBe('In summer, Mincha & Maariv 15 min before sunset, Sun–Thu.')
  })

  it('a time in words stays in words', () => {
    const t = weekdayTable([m({ tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: 'Call to Confirm' })], null)!
    expect(t.rows).toEqual([{ days: ['sun', 'mon', 'tue', 'wed', 'thu'], label: 'Sun–Thu', cells: ['Call to confirm'] }])
  })

  it('none for a shul that only davens on Shabbos; Friday night isn’t a weekday', () => {
    expect(weekdayTable([m({ days: ['sat'], time: '10:45am' }), m({ tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm' })], null)).toBeNull()
  })
})

describe('the usual Shabbos times, in the order Shabbos happens', () => {
  it('Friday night, Shabbos morning, afternoon; rules as rules; this season’s, the other one line (Mekor Habracha)', () => {
    const s = shabbosList(mekor, 'summer')!
    expect(s.lines.map((l) => [l.part, l.tefillah, l.when])).toEqual([
      ['friday', 'mincha_maariv', 'at candle lighting, never after 7 PM'],
      ['morning', 'shacharis', '9:15 AM'],
      ['afternoon', 'mincha_maariv', '30 min before sunset'],
    ])
    expect(s.otherSeason).toBe('In winter, also Mincha 12:20 PM, following Kiddush.')
  })

  it('Friday’s Shacharis stays with the weekdays; Motzei Shabbos is its own part', () => {
    const s = shabbosList([m({ days: ['fri', 'sat'], time: '7:00am' }), m({ tefillah: 'maariv', days: ['sat'], anchor: 'havdalah', offsetMinutes: 0, time: 'At Havdalah' })], null)!
    expect(s.lines.map((l) => [l.part, l.when])).toEqual([
      ['morning', '7 AM'],
      ['motzei', 'at havdalah'],
    ])
  })

  it('Yom Tov times are the Shabbos box’s, after Motzei Shabbos (Oct 10)', () => {
    const s = shabbosList([m({ days: ['sat', 'yom_tov'], time: '9:00am' }), m({ tefillah: 'mincha', days: ['yom_tov'], time: '6:30pm' })], null)!
    expect(s.lines.map((l) => [l.part, l.tefillah, l.when])).toEqual([
      ['morning', 'shacharis', '9 AM'],
      ['yomtov', 'shacharis', '9 AM'],
      ['yomtov', 'mincha', '6:30 PM'],
    ])
  })

  it('"Ends at" notes read "Until" (Rodeph Shalom)', () => {
    const s = shabbosList([m({ days: ['sat'], time: '10:45am', notes: 'Ends at 12:15pm' }), m({ tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm', notes: 'Ends at 7:30pm ' })], null)!
    expect(s.lines.map((l) => [l.part, l.when, l.note])).toEqual([
      ['friday', '6 PM', 'Until 7:30 PM'],
      ['morning', '10:45 AM', 'Until 12:15 PM'],
    ])
  })

  it('none when there are no Shabbos times (Lower Merion)', () => {
    expect(shabbosList(lowerMerion, 'summer')).toBeNull()
  })
})

describe('times written one way', () => {
  it('reads the ways people type a time', () => {
    expect(['7:15am', '7:15 AM', '19:30', '7 am', '12:20pm', '12am'].map(clockMinutes)).toEqual([435, 435, 1170, 420, 740, 0])
    expect(clockMinutes('Call to Confirm')).toBeNull()
    expect(clockMinutes('7')).toBeNull()
  })
  it('a zman rule with its bounds', () => {
    expect(timeText({ time: '', anchor: 'candle_lighting', offsetMinutes: 0, notBefore: '5:00 PM', notAfter: '7:00 PM' })).toBe('at candle lighting, between 5 PM and 7 PM')
    expect(timeText({ time: '', anchor: 'sunset', offsetMinutes: 20 })).toBe('20 min after sunset')
  })
  it('notes', () => {
    expect(noteText('Ends at 9:15am')).toBe('Until 9:15 AM')
    expect(noteText(' zoom ')).toBe('Zoom')
    expect(noteText('')).toBeNull()
  })
})
