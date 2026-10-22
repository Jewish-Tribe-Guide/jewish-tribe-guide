import { describe, expect, it } from 'vitest'
import type { Minyan } from './davening'
import type { SpecialSchedule } from './schedules'
import { changeCount, proposalLine, scheduleProposal, usualProposal } from './timesProposal'

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
        isWeek: true,
        days: [
          { label: 'Friday, Oct 23', rows: [{ what: 'Mincha & Maariv', when: '6 PM', note: 'With Kabbalas Shabbos', usually: null }] },
          {
            label: 'Saturday, Oct 24',
            rows: [
              { what: 'Shacharis', when: '9 AM', note: null, usually: '9:15 AM' },
              { what: 'Mincha', when: '5:45 PM', note: null, usually: null },
            ],
          },
        ],
      },
    ])
  })

  it('leaves out a schedule the listing has already, and names one it takes off', () => {
    const old = { ...week, id: 'old', name: 'Sukkos', kind: undefined }
    expect(scheduleProposal([week, old], [week], [])).toEqual({ weeks: [], gone: ['Sukkos'] })
  })
})
