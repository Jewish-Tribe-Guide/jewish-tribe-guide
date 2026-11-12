import { describe, expect, it } from 'vitest'
import { addsNothing, keepListedNotes, leaveOutTurnedDown, type Decision } from './websiteNotes'
import type { SpecialSchedule } from './schedules'

describe('addsNothing', () => {
  // South Philadelphia Shtiebel's week, read again Nov 11.
  it('a note that only drops or rewords the listing’s words adds nothing', () => {
    expect(addsNothing('until 8:00 AM; coffee and learning', 'until 8:00 AM')).toBe(true)
    expect(addsNothing('until 5:28 PM; seudah shlishit', 'until 5:28 PM; and seudah shlishit')).toBe(true)
    expect(addsNothing('Seudah Shlishit', undefined)).toBe(true)
  })

  it('a word the listing’s note doesn’t have is something new', () => {
    expect(addsNothing('until 8:00 AM; coffee and learning', 'until 8:00 AM; no learning')).toBe(false)
    expect(addsNothing('until 8:00 AM', 'until 8:30 AM')).toBe(false)
    expect(addsNothing(undefined, 'coffee')).toBe(false)
    expect(addsNothing('coffee', 'coffee')).toBe(false)
  })
})

describe('keepListedNotes', () => {
  const week = (notes: (string | undefined)[], over: Partial<SpecialSchedule> = {}): SpecialSchedule => ({
    id: 'w',
    name: 'Times for Nov 8 – Nov 14',
    from: '2026-11-08',
    to: '2026-11-14',
    kind: 'week',
    mode: 'replace',
    postedBy: 'website',
    minyanim: [
      { id: 'a', on: ['2026-11-11'], time: '7:30am', tefillah: 'shacharis', ...(notes[0] ? { notes: notes[0] } : {}) },
      { id: 'b', on: ['2026-11-14'], time: '4:15 PM', tefillah: 'mincha', ...(notes[1] ? { notes: notes[1] } : {}) },
    ],
    ...over,
  })

  it('keeps the listing’s note for the same minyan when the read adds nothing', () => {
    const before = [week(['until 8:00 AM; coffee and learning', 'until 5:28 PM; seudah shlishit'])]
    const after = [week(['until 8:00 AM', 'until 5:28 PM; and seudah shlishit'])]
    expect(keepListedNotes(before, after)[0].minyanim.map((m) => m.notes)).toEqual(['until 8:00 AM; coffee and learning', 'until 5:28 PM; seudah shlishit'])
  })

  it('takes a note that says something new, and leaves a moved time and other weeks alone', () => {
    const before = [week(['until 8:00 AM; coffee and learning', 'seudah shlishit'])]
    const moved = week(['until 8:00 AM', 'no seudah shlishit this week'])
    moved.minyanim[0] = { ...moved.minyanim[0], time: '7:45am' }
    expect(keepListedNotes(before, [moved])[0].minyanim.map((m) => m.notes)).toEqual(['until 8:00 AM', 'no seudah shlishit this week'])
    const newsletter = week(['until 8:00 AM', undefined], { postedBy: undefined })
    expect(keepListedNotes(before, [newsletter])[0]).toBe(newsletter)
  })
})

describe('leaveOutTurnedDown', () => {
  type M = SpecialSchedule['minyanim'][number]
  const wk = (minyanim: M[], over: Partial<SpecialSchedule> = {}): SpecialSchedule => ({ id: 'w', name: 'Times for Nov 8 – Nov 14', from: '2026-11-08', to: '2026-11-14', kind: 'week', mode: 'replace', postedBy: 'website', minyanim, ...over })
  const thu = (time: string, over: Partial<M> = {}): M => ({ id: 'th', tefillah: 'mincha', on: ['2026-11-12'], time, ...over })
  const sat = (time: string, over: Partial<M> = {}): M => ({ id: 'sa', tefillah: 'shacharis', on: ['2026-11-14'], time, ...over })
  const no = (minyanim: M[], at = '2026-11-11T12:00:00.000Z'): Decision => ({ turnedDown: true, at, weeks: [wk(minyanim)] })
  const yes = (minyanim: M[], at: string): Decision => ({ turnedDown: false, at, weeks: [wk(minyanim)] })

  const listed = [wk([thu('4:30pm'), sat('9:00am')])]

  it('puts a day the admin turned down back as the listing has it, and keeps the rest of the read', () => {
    const read = [wk([thu('4:30pm', { notes: 'Bar Mitzvah' }), sat('9:30am')])]
    const out = leaveOutTurnedDown(listed, read, [no([thu('4:30pm', { notes: 'Bar Mitzvah' }), sat('9:00am')])])
    expect(out[0].minyanim).toEqual([sat('9:30am'), thu('4:30pm')])
  })

  it('a week back to just what the listing has is the listing’s own copy', () => {
    const read = [wk([thu('4:30pm', { joinLink: 'https://zoom.us/j/1', id: 'x' }), sat('9:00am')], { id: 'w' })]
    expect(leaveOutTurnedDown(listed, read, [no(read[0].minyanim)])[0]).toBe(listed[0])
  })

  it('a minyan taken off, and one added, turned down stay as the listing has them', () => {
    expect(leaveOutTurnedDown(listed, [wk([sat('9:00am')])], [no([sat('9:00am')])])[0]).toBe(listed[0])
    const added = [wk([thu('4:30pm'), sat('9:00am'), { id: 'n', tefillah: 'maariv', on: ['2026-11-12'], time: '8:00pm' }])]
    expect(leaveOutTurnedDown(listed, added, [no(added[0].minyanim)])[0]).toBe(listed[0])
  })

  it('a new week turned down whole isn’t filed again', () => {
    const read = [wk([sat('9:00am')], { id: 'next', from: '2026-11-15', to: '2026-11-21', minyanim: [{ ...sat('9:00am'), on: ['2026-11-21'] }] })]
    expect(leaveOutTurnedDown([], read, [{ turnedDown: true, at: '2026-11-11', weeks: read }])).toEqual([])
  })

  it('files what the page changes again, another day, another week, and a day approved since', () => {
    const read = [wk([thu('4:45pm'), sat('9:00am')])]
    expect(leaveOutTurnedDown(listed, read, [no([thu('4:40pm'), sat('9:00am')])])).toBe(read)
    const otherWeek = [wk([thu('4:30pm', { notes: 'Bar Mitzvah' })], { id: 'n', from: '2026-11-15', to: '2026-11-21' })]
    expect(leaveOutTurnedDown(listed, otherWeek, [no([thu('4:30pm', { notes: 'Bar Mitzvah' })])])).toBe(otherWeek)
    const noted = [wk([thu('4:30pm', { notes: 'Bar Mitzvah' }), sat('9:00am')])]
    const turned = no(noted[0].minyanim, '2026-11-11T12:00:00.000Z')
    expect(leaveOutTurnedDown(listed, noted, [turned, yes(listed[0].minyanim, '2026-11-11T13:00:00.000Z')])).toBe(noted)
    expect(leaveOutTurnedDown(listed, noted, [turned, yes(listed[0].minyanim, '2026-11-11T11:00:00.000Z')])[0]).toBe(listed[0])
  })

  it('leaves a newsletter week alone, and does nothing with nothing turned down', () => {
    const letter = [wk([thu('4:30pm', { notes: 'Bar Mitzvah' })], { postedBy: undefined })]
    expect(leaveOutTurnedDown(listed, letter, [no(letter[0].minyanim)])).toBe(letter)
    const read = [wk([thu('4:30pm', { notes: 'Bar Mitzvah' }), sat('9:00am')])]
    expect(leaveOutTurnedDown(listed, read, [yes(read[0].minyanim, '2026-11-11')])).toBe(read)
  })
})
