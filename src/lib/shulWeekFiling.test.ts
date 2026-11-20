import { describe, expect, it } from 'vitest'
import type { Minyan, Tefillah } from './davening'
import type { SpecialSchedule } from './schedules'
import { weekFrom, type DatedTime, type Finding, type SourceRead, type WeekContext } from './shulTimes'
import { findingWeek, heldWeeks, newsletterGives, newsletterReads, withFindings } from './shulWeekFiling'

// The week is Sun Nov 15 – Sat Nov 21, 2026; today Thu Nov 19.
const WEEK = { from: '2026-11-15', to: '2026-11-21' }
const SUN = '2026-11-15', MON = '2026-11-16', THU = '2026-11-19', FRI = '2026-11-20', SAT = '2026-11-21'
const NOW = Date.parse('2026-11-19T23:00:00Z')

const t = (date: string, tefillah: Tefillah, time: string, extra: Partial<DatedTime> = {}): DatedTime => ({ date, tefillah, time, ...extra })
const m = (tefillah: Tefillah, days: Minyan['days'], time: string): Minyan => ({ id: `${tefillah}-${days.join('')}`, tefillah, days, time })
const USUAL: Minyan[] = [m('shacharis', ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'], '7:00 AM'), m('kabbalas_shabbos', ['fri'], '4:30 PM'), m('shacharis', ['sat'], '9:00 AM'), m('mincha', ['sat'], '4:15 PM')]
const ctx = (over: Partial<WeekContext> = {}): WeekContext => ({ week: WEEK, today: THU, usual: USUAL, held: [], zmanim: {}, ...over })
const page = (shape: SourceRead['shape'], shows: { from: string; to: string }, times: DatedTime[], extra: Partial<SourceRead> = {}): SourceRead => ({
  source: { id: 'https://shul.example/', kind: shape === 'schedule' ? 'calendar' : 'page', label: 'their page', at: '2026-11-19T23:00:00Z' },
  shape,
  shows,
  times,
  ...extra,
})
const week = (over: Partial<SpecialSchedule>): SpecialSchedule => ({ id: 'w', name: 'Times', from: SUN, to: SAT, mode: 'replace', kind: 'week', minyanim: [], ...over })
let n = 0
const newId = () => `id${++n}`
const act = (f: Finding) => f as Extract<Finding, { do: 'take' | 'ask' }>

describe('a finding as the week put on the listing', () => {
  it('a whole Shabbos is Friday night to Saturday, whole, for Shabbos only', () => {
    const calendar = page('schedule', WEEK, [t(SUN, 'shacharis', '7:00 AM'), t(FRI, 'kabbalas_shabbos', '4:25 PM'), t(SAT, 'shacharis', '9:00 AM')])
    const [, shabbos] = weekFrom([calendar], ctx())
    expect(shabbos.do).toBe('take')
    const { schedules, lines } = withFindings([], [shabbos], ctx(), { now: NOW, newId })
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toMatchObject({ from: FRI, to: SAT, whole: true, parts: ['shabbos'], postedBy: 'website', kind: 'week' })
    expect(schedules[0].minyanim.map((x) => [x.tefillah, x.time, x.on])).toEqual([
      ['kabbalas_shabbos', '4:25 PM', [FRI]],
      ['shacharis', '9:00 AM', [SAT]],
    ])
    expect(lines[schedules[0].id][0]).toBe('Their whole schedule for Shabbos')
  })

  it('a highlight’s ask keeps the usual minyanim it doesn’t mention, on the days it shows', () => {
    const box = page('highlight', { from: FRI, to: SAT }, [t(FRI, 'kabbalas_shabbos', '5:00 PM')], { heading: 'This Shabbat' })
    const [, shabbos] = weekFrom([box], ctx())
    expect(shabbos).toMatchObject({ do: 'ask', different: [{ read: { time: '5:00 PM' } }] })
    const got = findingWeek(act(shabbos), ctx())
    expect(got.from).toBe(FRI)
    expect(got.to).toBe(SAT)
    expect(got.times.map((x) => `${x.date} ${x.tefillah} ${x.time}`)).toEqual([`${FRI} kabbalas_shabbos 5:00 PM`, `${SAT} shacharis 9:00 AM`, `${SAT} mincha 4:15 PM`])
    const { lines, schedules } = withFindings([], [shabbos], ctx(), { now: NOW, newId })
    expect(lines[schedules[0].id]).toEqual(['Read as a highlight, under “This Shabbat”, for Shabbos', 'At another time: Kabbalas Shabbos Fri Nov 20 5:00 PM, usually 4:30 PM'])
  })

  it('a cancelled Shabbos is a day with nothing on it, said in their words', () => {
    const box = page('highlight', { from: SAT, to: SAT }, [], { cancelled: [{ date: SAT, quote: 'No Shabbat services this week' }] })
    const [, shabbos] = weekFrom([box], ctx())
    expect(shabbos.do).toBe('ask')
    const got = findingWeek(act(shabbos), ctx())
    expect(got).toEqual({ from: SAT, to: SAT, times: [] })
    expect(Object.values(withFindings([], [shabbos], ctx(), { now: NOW, newId }).lines)).toEqual([['Read as a highlight, for Shabbos', 'They say: “No Shabbat services this week”']])
  })

  it('the same week read again changes nothing', () => {
    const calendar = page('schedule', WEEK, [t(FRI, 'kabbalas_shabbos', '4:25 PM'), t(SAT, 'shacharis', '9:00 AM')])
    const fs = weekFrom([calendar], ctx())
    const once = withFindings([], fs, ctx(), { now: NOW, newId })
    const again = withFindings(once.schedules, fs, ctx(), { now: NOW + 86_400_000, newId })
    expect(again.schedules).toEqual(once.schedules)
    expect(again.lines).toEqual({})
  })

  it('replaces only the website’s week for that part, keeping its other half and the newsletter’s', () => {
    const old = week({ id: 'old', postedBy: 'website', minyanim: [{ id: 'a', tefillah: 'shacharis', time: '7:00 AM', on: [MON] }, { id: 'b', tefillah: 'shacharis', time: '9:00 AM', on: [SAT] }] })
    const letter = week({ id: 'letter', from: MON, to: MON, minyanim: [{ id: 'c', tefillah: 'maariv', time: '8:00 PM', on: [MON] }] })
    const box = page('highlight', { from: SAT, to: SAT }, [t(SAT, 'shacharis', '9:30 AM')])
    const [, shabbos] = weekFrom([box], ctx())
    const { schedules } = withFindings([old, letter], [shabbos], ctx(), { now: NOW, newId })
    expect(schedules.find((s) => s.id === 'old')).toBeUndefined()
    expect(schedules.find((s) => s.id === 'letter')).toBe(letter)
    const kept = schedules.find((s) => s.parts?.[0] === 'weekdays')!
    expect(kept.minyanim.map((x) => x.on)).toEqual([[MON]])
    expect(schedules.find((s) => s.parts?.[0] === 'shabbos')!.minyanim.map((x) => x.time)).toEqual(['9:30 AM', '4:15 PM'])
  })
})

describe('the listing’s weeks, read back', () => {
  it('a part is held only when a week on the listing speaks for it', () => {
    const s = week({ from: FRI, to: SAT, parts: ['shabbos'], whole: true, minyanim: [] })
    expect(heldWeeks([s], WEEK)).toEqual([{ part: 'shabbos', times: [] }])
    expect(heldWeeks([{ ...s, parts: undefined }], WEEK).map((h) => h.part)).toEqual(['shabbos'])
  })

  // The Shtiebel's newsletter gives Shabbos only: its week, Friday to
  // Saturday, overlaps Friday's Shacharis but says nothing of the weekdays.
  it('a week with no parts holds only a part it gives times in, or spans whole', () => {
    const shabbosOnly = week({ from: FRI, to: SAT, minyanim: [{ id: 'x', tefillah: 'shacharis', time: '9:30 AM', on: [SAT] }] })
    expect(heldWeeks([shabbosOnly], WEEK).map((h) => h.part)).toEqual(['shabbos'])
    expect(heldWeeks([week({ minyanim: [] })], WEEK).map((h) => h.part)).toEqual(['weekdays', 'shabbos'])
  })

  it('a week no website posted is the newsletter’s', () => {
    const letter = week({ id: 'l', minyanim: [{ id: 'x', tefillah: 'shacharis', time: '7:00 AM', on: [MON] }] })
    const site = week({ id: 's', postedBy: 'website' })
    expect(newsletterReads([letter, site], WEEK).map((r) => [r.source.kind, r.source.id, r.times.length])).toEqual([['newsletter', 'week:l', 1]])
  })

  it('a newsletter gives a part it gave in two of the last six weeks', () => {
    const shabbos = (sat: string, id: string) => week({ id, from: sat, to: sat, minyanim: [{ id, tefillah: 'shacharis', time: '9:00 AM', on: [sat] }] })
    const one = [shabbos('2026-11-14', 'a')]
    expect(newsletterGives(one, THU)).toEqual([])
    expect(newsletterGives([...one, shabbos('2026-11-07', 'b')], THU)).toEqual(['shabbos'])
    // A website's weeks and ones long gone don't count.
    expect(newsletterGives([...one, { ...shabbos('2026-11-07', 'b'), postedBy: 'website' }], THU)).toEqual([])
    expect(newsletterGives([...one, shabbos('2026-09-26', 'c')], THU)).toEqual([])
  })
})
