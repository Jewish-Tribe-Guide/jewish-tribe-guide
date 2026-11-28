import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { isHomePage, pageOfNote, partKey, partLines, partSize, partsFromRead, partsGiven, readPartSource, rebasePart, scheduleTakesPart, splitParts, weekChangesTimes, withPart } from './timesParts'

const K = 'minyanim'
const SK = 'minyanim_schedules'
const mincha: Minyan = { id: 'm', tefillah: 'mincha', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], time: '6:00pm' }
const shacharis: Minyan = { id: 's', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' }
const shabbos: Minyan = { id: 'b', tefillah: 'shacharis', days: ['sat'], time: '9:00am' }
const week: SpecialSchedule = {
  id: 'w',
  name: 'Times for Oct 19 – Oct 25',
  from: '2026-10-19',
  to: '2026-10-25',
  mode: 'replace',
  kind: 'week',
  postedBy: 'website',
  minyanim: [{ id: 'a', tefillah: 'shacharis', on: ['2026-10-24'], time: '8:30am' }],
}
const listing = { name: 'Sons of Israel', [K]: [shacharis, mincha, shabbos], [SK]: [] }
const parts = (read: Record<string, unknown>) => splitParts(listing, { ...listing, ...read }, K).map((p) => p.part)

describe('splitParts', () => {
  it('files nothing when the website says what the listing does, however it splits the days and whatever the ids', () => {
    const read = [
      { ...shacharis, id: 'x1' },
      { ...mincha, id: 'x2', days: ['sun'] },
      { ...mincha, id: 'x3', days: ['mon', 'tue', 'wed', 'thu'] },
      { ...mincha, id: 'x4', days: ['fri'] },
      { ...shabbos, id: 'x5' },
    ]
    expect(parts({ [K]: read })).toEqual([])
  })

  it('a changed Shabbos is the Shabbos part alone, leaving the listing’s weekdays as they are', () => {
    const [part, ...rest] = splitParts(listing, { ...listing, [K]: [{ ...shacharis, time: '7:00am' }, mincha, { ...shabbos, time: '8:30am' }] }, K)
    expect([part.part, ...rest.map((p) => p.part)]).toEqual(['weekday', 'shabbos'])
    const sh = rest[0]
    expect(sh.details[K]).toEqual(expect.arrayContaining([shacharis, expect.objectContaining({ tefillah: 'shacharis', days: ['sat'], time: '8:30am' })]))
    expect(sh.details[SK]).toEqual([])
    expect(sh.details.name).toBe('Sons of Israel')
  })

  it('Friday’s Mincha is a Shabbos time: changing it is the Shabbos part, and Sun–Thu stays', () => {
    const read = [shacharis, { ...mincha, days: ['sun', 'mon', 'tue', 'wed', 'thu'] }, { ...mincha, id: 'f', days: ['fri'], time: '5:30pm' }, shabbos]
    const [sh] = splitParts(listing, { ...listing, [K]: read }, K)
    expect(sh.part).toBe('shabbos')
    expect(sh.details[K]).toEqual(expect.arrayContaining([expect.objectContaining({ tefillah: 'mincha', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '6:00pm' }), expect.objectContaining({ tefillah: 'mincha', days: ['fri'], time: '5:30pm' })]))
  })

  it('a posted week is this week’s part only, with the schedule it adds', () => {
    const [p, ...rest] = splitParts(listing, { ...listing, [SK]: [week] }, K)
    expect(rest).toEqual([])
    expect(p).toMatchObject({ part: 'week', source: { part: 'week', field: K, schedules: ['w'] }, size: 1 })
    expect(p.details[K]).toEqual(listing[K])
    expect(p.details[SK]).toEqual([week])
  })

  it('the same week read again under a new id is no change', () => {
    const on = { ...listing, [SK]: [week] }
    expect(splitParts(on, { ...on, [SK]: [{ ...week, id: 'w2', postedAt: '2026-10-21', minyanim: [{ ...week.minyanim[0], id: 'z' }] }] }, K)).toEqual([])
  })
})

// Sons of Israel, Nov 28: its calendar read again on Shabbos morning, the
// Mincha notes worded from the event text and Friday already gone.
describe('weekChangesTimes', () => {
  const shabbosWeek: SpecialSchedule = {
    id: 'old',
    name: 'Times for Nov 22 – Nov 28',
    from: '2026-11-27',
    to: '2026-11-28',
    mode: 'replace',
    kind: 'week',
    whole: true,
    parts: ['shabbos'],
    postedBy: 'website',
    minyanim: [
      { id: '1', tefillah: 'mincha_maariv', on: ['2026-11-27'], time: '4:20pm', notes: 'Winter only' },
      { id: '2', tefillah: 'shacharis', on: ['2026-11-28'], time: '9:00am' },
      { id: '3', tefillah: 'mincha', on: ['2026-11-28'], time: '4:00pm', notes: 'Teen Minyan' },
    ],
  }
  const on = { ...listing, [SK]: [shabbosWeek] }
  const reread = (minyanim: SpecialSchedule['minyanim'], also: Partial<SpecialSchedule> = {}) => {
    const [p] = splitParts(on, { ...on, [SK]: [{ ...shabbosWeek, id: 'new', minyanim, ...also }] }, K)
    return p
  }
  const today = '2026-11-28'
  const sat = shabbosWeek.minyanim.slice(1)

  it('a note worded again, and Friday gone by, is a part but not a change worth filing', () => {
    const p = reread([sat[0], { ...sat[1], id: '9', notes: 'Teen Minyan; Join for Mincha, stay for special Seudah Shlishit just for teens.' }])
    expect(p.part).toBe('week')
    expect(weekChangesTimes(p.source, on, p.details, today)).toBe(false)
  })

  it('a time moved, added or taken off from today on is', () => {
    expect(weekChangesTimes(reread([sat[0], { ...sat[1], time: '4:10pm' }]).source, on, reread([sat[0], { ...sat[1], time: '4:10pm' }]).details, today)).toBe(true)
    const added = reread([...sat, { id: '4', tefillah: 'maariv', on: ['2026-11-28'], time: '5:20pm' }])
    expect(weekChangesTimes(added.source, on, added.details, today)).toBe(true)
    const gone = reread([sat[0]])
    expect(weekChangesTimes(gone.source, on, gone.details, today)).toBe(true)
  })

  it('Friday taken off is a change while it’s still Friday', () => {
    const p = reread(sat)
    expect(weekChangesTimes(p.source, on, p.details, '2026-11-27')).toBe(true)
    expect(weekChangesTimes(p.source, on, p.details, today)).toBe(false)
  })

  it('the week’s own terms changing is a change', () => {
    const p = reread(shabbosWeek.minyanim, { whole: undefined })
    expect(weekChangesTimes(p.source, on, p.details, today)).toBe(true)
  })

  it('a new week is a change; a week wholly gone by is not', () => {
    const [p] = splitParts(listing, { ...listing, [SK]: [shabbosWeek] }, K)
    expect(weekChangesTimes(p.source, listing, p.details, today)).toBe(true)
    expect(weekChangesTimes(p.source, listing, p.details, '2026-11-29')).toBe(false)
  })

  it('a usual part is always filed by it', () => {
    const [p] = splitParts(listing, { ...listing, [K]: [{ ...shacharis, time: '7:00am' }, mincha, shabbos] }, K)
    expect(weekChangesTimes(p.source, listing, p.details, today)).toBe(true)
  })
})

describe('rebasePart', () => {
  it('puts the Shabbos times on the listing as it is now, so they never undo weekday times approved since', () => {
    const [, sh] = splitParts(listing, { ...listing, [K]: [{ ...shacharis, time: '7:00am' }, mincha, { ...shabbos, time: '8:30am' }] }, K)
    const now = { ...listing, [K]: [{ ...shacharis, time: '7:00am' }, mincha, shabbos], phone: 'kept' }
    const out = rebasePart(sh.source, now, sh.details)
    expect(out[K]).toEqual(expect.arrayContaining([expect.objectContaining({ tefillah: 'shacharis', days: shacharis.days, time: '7:00am' }), expect.objectContaining({ days: ['sat'], time: '8:30am' })]))
    expect(out.phone).toBe('kept')
  })

  it('this week replaces only its own schedule, keeping one added by hand since', () => {
    const [p] = splitParts(listing, { ...listing, [SK]: [week] }, K)
    const sukkos: SpecialSchedule = { ...week, id: 'k', name: 'Sukkos', kind: undefined, postedBy: undefined }
    const out = rebasePart(p.source, { ...listing, [K]: [shacharis], [SK]: [sukkos] }, p.details)
    expect(out[SK]).toEqual([sukkos, week])
    expect(out[K]).toEqual([shacharis])
  })

  it('takes the admin’s edit of the week, and a schedule the edit adds', () => {
    const [p] = splitParts(listing, { ...listing, [SK]: [week] }, K)
    const edited = { ...week, minyanim: [{ ...week.minyanim[0], time: '8:45am' }] }
    const extra = { ...week, id: 'e', name: 'Extra' }
    expect(rebasePart(p.source, listing, { ...p.details, [SK]: [edited, extra] })[SK]).toEqual([edited, extra])
  })
})

describe('withPart', () => {
  it('a week taken off the website comes off the listing', () => {
    expect(withPart('week', { minyanim: [], schedules: [week] }, { minyanim: [], schedules: [] }).schedules).toEqual([])
  })
})

describe('partKey and partSize', () => {
  it('the same Shabbos from two pages is the same finding, and the page giving more of it is bigger', () => {
    const one = splitParts(listing, { ...listing, [K]: [shacharis, mincha, { ...shabbos, time: '8:30am' }] }, K)[0]
    const two = splitParts(listing, { ...listing, [K]: [shacharis, mincha, { ...shabbos, id: 'q', time: '8:30am' }, { id: 'r', tefillah: 'mincha', days: ['sat'], time: '5:00pm' }] }, K)[0]
    const again = splitParts(listing, { ...listing, [K]: [{ ...shacharis, id: 'n' }, mincha, { ...shabbos, id: 'o', time: '8:30am' }] }, K)[0]
    expect(partKey(one.source, one.details)).toBe(partKey(again.source, again.details))
    expect(partKey(one.source, one.details)).not.toBe(partKey(two.source, two.details))
    expect([partSize(one.source, one.details), partSize(two.source, two.details)]).toEqual([2, 3])
  })

  it('reads a stated part, and nothing a filer didn’t state well', () => {
    expect(readPartSource({ part: 'week', field: K, schedules: ['w', 3] })).toEqual({ part: 'week', field: K, schedules: ['w'] })
    expect(readPartSource({ part: 'shabbos', field: K })).toEqual({ part: 'shabbos', field: K })
    expect(readPartSource({ part: 'yom_tov', field: K })).toBeNull()
    expect(readPartSource({ part: 'shabbos' })).toBeNull()
  })
})

describe('partLines', () => {
  it('says what each part changes, in its own words', () => {
    const [wk, sh] = splitParts(listing, { ...listing, [K]: [{ ...shacharis, time: '7:00am' }, mincha, { ...shabbos, time: '8:30am' }] }, K)
    expect(partLines(wk.source, listing, wk.details)).toEqual(['Changed: Shacharis · Mon–Fri, 7 AM, was 6:45 AM'])
    expect(partLines(sh.source, listing, sh.details)).toEqual(['Changed: Shacharis · Sat, 8:30 AM, was 9 AM'])
    const [w] = splitParts(listing, { ...listing, [SK]: [week] }, K)
    expect(partLines(w.source, listing, w.details)).toEqual(['Posted: This week’s schedule, Oct 19 – Oct 25'])
  })
})

// What a page gave, said in Reads ("Usual weekday times · Usual Shabbos
// times"), and how a part picks its page when several give it: the fullest.
describe('partsGiven and partsFromRead', () => {
  it('counts a reading’s rows by part: Friday night is Shabbos, Friday Shacharis a weekday, a week its own; what goes or is kept isn’t given', () => {
    const rows = [
      { day: 'fri', tefillah: 'mincha_maariv', status: 'new' },
      { day: 'fri', tefillah: 'shacharis', status: 'same' },
      { day: 'sat', tefillah: 'shacharis', status: 'changed' },
      { day: 'mon', tefillah: 'mincha', status: 'gone' },
      { day: 'tue', tefillah: 'mincha', status: 'kept' },
      { day: 'yom_tov', tefillah: 'shacharis', status: 'new' },
    ]
    expect(partsGiven([{ kind: 'usual', rows }])).toEqual([
      { part: 'weekday', size: 1 },
      { part: 'shabbos', size: 2 },
    ])
    expect(partsGiven([{ kind: 'week', rows: [{ day: 'sun', tefillah: 'mincha', status: 'new' }] }])).toEqual([{ part: 'week', size: 1 }])
    expect(partsGiven([{ kind: 'usual', rows: [{ day: '2026-10-25', tefillah: 'mincha', status: 'new' }] }])).toEqual([{ part: 'week', size: 1 }])
  })

  it('an older check with no parts: read from its lines, a range of days and a date included, each line once per part', () => {
    expect(
      partsFromRead(['Shacharis Mon–Fri 6:45 AM', 'Shacharis Sun, Sat 8:00 AM', 'Mincha & Maariv Fri 7:00 PM · Summer', 'Mincha & Maariv Sun–Thu 15 min before sunset', 'Oct 24 Shacharis 9:00 AM']),
    ).toEqual([
      { part: 'weekday', size: 3 },
      { part: 'shabbos', size: 2 },
      { part: 'week', size: 1 },
    ])
    expect(partsFromRead([])).toEqual([])
  })
})

describe('a home page and the shul’s schedule page (Nov 23)', () => {
  it('knows a home page', () => {
    expect(['https://soi.example/', 'https://soi.example', 'https://soi.example/index.html'].map(isHomePage)).toEqual([true, true, true])
    expect(['https://soi.example/tefillot', 'https://soi.example/?p=12', null, 'not a url'].map(isHomePage)).toEqual([false, false, false, false])
  })

  it('leaves a usual part to another page that gives it, never this week’s', () => {
    const others = [{ url: 'https://soi.example/tefillot', parts: [{ part: 'shabbos' as const, size: 6 }, { part: 'week' as const, size: 3 }] }]
    expect(scheduleTakesPart('https://soi.example/', 'shabbos', others)).toBe('https://soi.example/tefillot')
    expect(scheduleTakesPart('https://soi.example/', 'weekday', others)).toBeNull()
    expect(scheduleTakesPart('https://soi.example/', 'week', others)).toBeNull()
    expect(scheduleTakesPart('https://soi.example/tefillot', 'shabbos', [{ url: 'https://soi.example/', parts: [{ part: 'shabbos', size: 9 }] }])).toBeNull()
  })

  it('reads the page off a finding’s note', () => {
    expect(pageOfNote('From their website, changed Oct 19: https://soi.example/')).toBe('https://soi.example/')
    expect(pageOfNote('pasted by a person')).toBeNull()
    expect(pageOfNote(undefined)).toBeNull()
  })
})
