import { describe, expect, it } from 'vitest'
import { addsNothing, keepListedNotes } from './websiteNotes'
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
