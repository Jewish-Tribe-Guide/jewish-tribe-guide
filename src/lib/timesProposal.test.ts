import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { boxPill, changeCount, daysHeading, groupedRows, joinClocks, proposalLine, rangeText, scheduleProposal, usualProposal } from './timesProposal'

const rule: Pick<Minyan, 'time' | 'anchor' | 'offsetMinutes' | 'notAfter'> = { time: 'At Candle Lighting (not after 7:00 PM)', anchor: 'candle_lighting', offsetMinutes: 0, notAfter: '19:00' }
const shacharis: Minyan = { id: 's1', tefillah: 'shacharis', days: ['mon', 'thu', 'rosh_chodesh'], time: '6:45am' }
const shabbos: Minyan = { id: 's2', tefillah: 'shacharis', days: ['sat'], time: '9:15am' }
const friday: Minyan = { id: 'f1', tefillah: 'mincha_maariv', days: ['fri'], ...rule }

describe('usualProposal', () => {
  it('marks Mekor Habracha’s Friday the website’s way: 7 PM new for summer, the rule changed to winter only', () => {
    const proposed: Minyan[] = [
      shacharis,
      shabbos,
      { id: 'n1', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00 PM', season: 'summer' },
      { id: 'f1', tefillah: 'mincha_maariv', days: ['fri'], ...rule, season: 'winter' },
    ]
    const boxes = usualProposal([shacharis, shabbos, friday], proposed)
    expect(boxes.map((b) => b.label)).toEqual(['Usual weekday times', 'Usual Shabbos times'])
    expect(boxes[0].rows).toEqual([expect.objectContaining({ status: 'same', what: 'Shacharis · Mon, Thu, Rosh Chodesh', when: '6:45 AM' })])
    const shabbosRows = boxes[1].rows.map((r) => [r.status, r.what, r.when, r.season, r.was])
    expect(shabbosRows).toEqual([
      ['new', 'Mincha & Maariv · Fri', '7 PM', 'Summer', undefined],
      ['changed', 'Mincha & Maariv · Fri', 'at candle lighting, never after 7 PM', 'Winter', { season: 'All year' }],
      ['same', 'Shacharis · Sat', '9:15 AM', null, undefined],
    ])
    expect(changeCount(boxes)).toBe(2)
    expect(proposalLine(boxes)).toBe('Mincha & Maariv · Fri: new, 7 PM in summer, at candle lighting, never after 7 PM in winter')
  })

  it('says what a changed time was, and a minyan the website no longer has', () => {
    const boxes = usualProposal([shacharis, shabbos], [{ ...shacharis, time: '7:00am' }])
    expect(boxes[0].rows).toEqual([expect.objectContaining({ status: 'changed', when: '7 AM', was: { when: '6:45 AM' } })])
    expect(boxes[1].rows).toEqual([expect.objectContaining({ status: 'gone', what: 'Shacharis · Sat', when: '9:15 AM' })])
    expect(proposalLine(boxes)).toBe('Shacharis · Mon, Thu, Rosh Chodesh: 7 AM. And 1 more change')
  })

  it('reads a “Winter only” note as the season, so it isn’t a change', () => {
    const noted: Minyan = { id: 'm', tefillah: 'maariv', days: ['sun'], time: '6:30pm', notes: 'Winter only' }
    const boxes = usualProposal([noted], [{ ...noted, notes: undefined, season: 'winter' }])
    expect(boxes[0].rows).toEqual([expect.objectContaining({ status: 'same', season: 'Winter', note: null })])
    expect(proposalLine(boxes)).toBeNull()
  })

  it('shows a sign-up change, so it’s never approved blind', () => {
    const boxes = usualProposal([shacharis], [{ ...shacharis, signUp: { link: 'chat.whatsapp.com/x' } }])
    expect(boxes[0].rows[0]).toMatchObject({ status: 'changed', note: 'Sign-up: chat.whatsapp.com/x', was: { note: 'No note' } })
  })

  it('shows a join link change, so it’s never approved blind (Oct 22)', () => {
    const boxes = usualProposal([shacharis], [{ ...shacharis, joinLink: 'https://upenn.zoom.us/j/97084263584' }])
    expect(boxes[0].rows[0]).toMatchObject({ status: 'changed', note: 'Online: upenn.zoom.us/j/97084263584', was: { note: 'No note' } })
  })
})

describe('scheduleProposal', () => {
  const week: SpecialSchedule = {
    id: 'w',
    name: 'Times for Oct 19 – Oct 25',
    from: '2026-10-19',
    to: '2026-10-25',
    mode: 'replace',
    kind: 'week',
    postedBy: 'website',
    minyanim: [
      { id: 'a', tefillah: 'shacharis', on: ['2026-10-24'], time: '9:00am' },
      { id: 'b', tefillah: 'mincha', on: ['2026-10-24'], time: '5:45pm' },
      { id: 'c', tefillah: 'mincha_maariv', on: ['2026-10-23'], time: '6:00pm', notes: 'with Kabbalas Shabbos' },
    ],
  }

  it('proposes a posted week on its own dates, beside the usual time it differs from', () => {
    const { weeks, gone } = scheduleProposal([], [week], [shabbos])
    expect(gone).toEqual([])
    expect(weeks).toEqual([
      {
        title: 'This week’s schedule, Oct 19 – Oct 25',
        range: 'Oct 19–25',
        isWeek: true,
        days: [
          { label: 'Fri, Oct 23', rows: [{ what: 'Mincha & Maariv', when: '6 PM', note: 'With Kabbalas Shabbos', usually: null }] },
          {
            label: 'Shabbos, Oct 24',
            rows: [
              { what: 'Shacharis', when: '9 AM', note: null, usually: '9:15 AM' },
              { what: 'Mincha', when: '5:45 PM', note: null, usually: null },
            ],
          },
        ],
      },
    ])
  })

  it('says a time’s join link, read off the calendar (Oct 22)', () => {
    const linked = { ...week, minyanim: [{ id: 't', tefillah: 'shacharis' as const, on: ['2026-10-22'], time: '8:10am', joinLink: 'https://upenn.zoom.us/j/97084263584' }] }
    expect(scheduleProposal([], [linked], []).weeks[0].days[0].rows[0]).toMatchObject({ what: 'Shacharis', note: 'Online: upenn.zoom.us/j/97084263584' })
  })

  // Mekor's newsletter, Oct 23: "held when there is sufficient interest".
  it('says a time is sign-up, and its group, so it’s never approved blind', () => {
    const signedUp = { ...week, minyanim: [{ id: 't', tefillah: 'maariv' as const, on: ['2026-10-22'], time: '5:45pm', signUp: { link: 'https://chat.whatsapp.com/Mekor' } }] }
    expect(scheduleProposal([], [signedUp], []).weeks[0].days[0].rows[0]).toMatchObject({ what: 'Maariv', note: 'Sign-up: chat.whatsapp.com/Mekor' })
  })

  it('leaves out a schedule the listing has already, and names one it takes off', () => {
    const old = { ...week, id: 'old', name: 'Sukkos', kind: undefined }
    expect(scheduleProposal([week, old], [week], [])).toEqual({ weeks: [], gone: ['Sukkos'] })
  })
})

// The drawing (B3vwpSiqwdK833s9VAVHBc): rows under the days they're on,
// Shabbos as Friday night and Shabbos day, one line per tefillah with its
// times joined ("6:45 and 8:15 AM"), and days with the same times as one.
describe('as the drawing groups it', () => {
  it('names days the way a shul’s schedule does', () => {
    expect(daysHeading(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Monday to Friday')
    expect(daysHeading(['sun'])).toBe('Sunday')
    expect(daysHeading(['sun', 'wed'])).toBe('Sunday and Wednesday')
    expect(daysHeading(['mon', 'thu', 'rosh_chodesh'])).toBe('Monday, Thursday and Rosh Chodesh')
  })

  it('joins a tefillah’s times when they share AM or PM, and not otherwise', () => {
    expect(joinClocks(['6:45 AM', '8:15 AM'])).toBe('6:45 and 8:15 AM')
    expect(joinClocks(['7 AM', '8 AM', '9 AM'])).toBe('7, 8 and 9 AM')
    expect(joinClocks(['11:30 AM', '1 PM'])).toBeNull()
    expect(joinClocks(['8 AM', '15 min before sunset'])).toBeNull()
  })

  it('a box’s pill counts what changes, by kind when there is one kind', () => {
    expect(boxPill([{ status: 'new' }, { status: 'new' }, { status: 'same' }])).toBe('2 new')
    expect(boxPill([{ status: 'changed' }])).toBe('1 changed')
    expect(boxPill([{ status: 'gone' }])).toBe('1 taken off')
    expect(boxPill([{ status: 'new' }, { status: 'gone' }])).toBe('2 updates')
    expect(boxPill([{ status: 'same' }])).toBeNull()
  })

  it('says a week as its dates', () => {
    expect(rangeText('2026-10-21', '2026-10-24')).toBe('Oct 21–24')
    expect(rangeText('2026-10-30', '2026-11-01')).toBe('Oct 30–Nov 1')
    expect(rangeText('2026-10-25', '2026-10-25')).toBe('Oct 25')
  })

  it('usual times: grouped by their days, a tefillah’s same times on one line, a new one kept apart', () => {
    const usual: Minyan[] = [
      { id: 'a', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' },
      { id: 'b', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '8:15am' },
      { id: 'c', tefillah: 'shacharis', days: ['sun'], time: '7:00am' },
      { id: 'd', tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm' },
      { id: 'e', tefillah: 'shacharis', days: ['sat'], time: '9:00am' },
    ]
    const proposed = [...usual, { id: 'f', tefillah: 'shacharis', days: ['sat'], time: '8:00am' } as Minyan]
    const [weekday, shabbos] = usualProposal(usual, proposed)
    expect(groupedRows(weekday.rows).map((g) => [g.label, g.rows.map((r) => `${r.tefillah} ${r.when}`)])).toEqual([
      ['Sunday', ['Shacharis 7 AM']],
      ['Monday to Friday', ['Shacharis 6:45 and 8:15 AM']],
    ])
    expect(groupedRows(shabbos.rows).map((g) => [g.label, g.rows.map((r) => `${r.status} ${r.when}`)])).toEqual([
      ['Friday night', ['same 7 PM']],
      ['Shabbos day', ['new 8 AM', 'same 9 AM']],
    ])
  })

  it('a week: days with the same times are one heading, and a tefillah’s times one line', () => {
    const week: SpecialSchedule = {
      id: 'w',
      name: 'Times for Oct 21 – Oct 24',
      from: '2026-10-21',
      to: '2026-10-24',
      mode: 'replace',
      kind: 'week',
      minyanim: [
        { id: 'a', tefillah: 'shacharis', on: ['2026-10-21', '2026-10-22'], time: '6:45am' },
        { id: 'b', tefillah: 'shacharis', on: ['2026-10-21', '2026-10-22'], time: '8:15am' },
        { id: 'c', tefillah: 'mincha_maariv', on: ['2026-10-21', '2026-10-22'], time: '5:55pm' },
        { id: 'd', tefillah: 'shacharis', on: ['2026-10-24'], time: '9:00am' },
      ],
    }
    const [w] = scheduleProposal([], [week], []).weeks
    expect(w.range).toBe('Oct 21–24')
    expect(w.days.map((d) => [d.label, d.rows.map((r) => `${r.what} ${r.when}`)])).toEqual([
      ['Wed, Oct 21 and Thu, Oct 22', ['Shacharis 6:45 and 8:15 AM', 'Mincha & Maariv 5:55 PM']],
      ['Shabbos, Oct 24', ['Shacharis 9 AM']],
    ])
  })
})
