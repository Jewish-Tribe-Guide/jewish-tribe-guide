import { describe, expect, it } from 'vitest'
import { formatStartsIn, nextUpcomingDavening, shulRowByShul, type ShulMinyanim } from './upcomingDavening'
import type { Minyan } from './davening'
import { geoKey } from './useZmanAnchors'

// Real data, not fixtures invented for the test: these are (trimmed to what
// this function reads) the actual minyanim on real synagogue listings, and
// the three scenarios below are the three points in the day this was
// designed against — see the home-break mockup this shipped from. Sunset
// that day was 7:24 PM, which is why "10 min before sunset" is 7:14 and
// "15 min before" is 7:09 below.

const kahalKadosh: ShulMinyanim = {
  name: 'Kahal Kadosh Mikveh Israel',
  geo: { lat: 39.9447, lng: -75.1469 },
  minyanim: [
    { id: 'm1', tefillah: 'shacharis', days: ['mon', 'thu'], time: '7:15am' },
    { id: 'm2', tefillah: 'mincha', days: ['mon', 'tue', 'wed', 'thu'], time: '2:00pm' },
  ],
}

const sonsOfIsrael: ShulMinyanim = {
  name: 'Congregation Sons of Israel',
  geo: { lat: 40.0023, lng: -75.2967 },
  minyanim: [
    { id: 'm1', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' },
    {
      id: 'm2',
      tefillah: 'mincha_maariv',
      days: ['sun', 'mon', 'tue', 'wed', 'thu'],
      time: '15 min before Sunset',
      anchor: 'sunset',
      offsetMinutes: -15,
    },
  ],
}

const lowerMerion: ShulMinyanim = {
  name: 'Lower Merion Synagogue',
  geo: { lat: 40.0187, lng: -75.2635 },
  minyanim: [
    { id: 'm1', tefillah: 'shacharis', days: ['mon', 'thu'], time: '6:45am' },
    {
      id: 'm2',
      tefillah: 'mincha_maariv',
      days: ['sun', 'mon', 'tue', 'wed', 'thu'],
      time: '10 min before Sunset',
      anchor: 'sunset',
      offsetMinutes: -10,
    },
  ],
}

const chabadMainLine: ShulMinyanim = {
  name: 'Chabad of the Main Line',
  geo: { lat: 40.0053, lng: -75.3068 },
  minyanim: [
    { id: 'm1', tefillah: 'shacharis', days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '6:45am' },
    {
      id: 'm2',
      tefillah: 'mincha_maariv',
      days: ['sun', 'mon', 'tue', 'wed', 'thu'],
      time: '10 min before Sunset',
      anchor: 'sunset',
      offsetMinutes: -10,
    },
  ],
}

// Never a candidate — no anchor and not a clock time, exactly the real
// "Call to Confirm" row this was written against.
const bnaiAbraham: ShulMinyanim = {
  name: "B'nai Abraham Chabad",
  geo: { lat: 39.9401, lng: -75.1553 },
  minyanim: [
    { id: 'm1', tefillah: 'mincha_maariv', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: 'Call to Confirm' },
  ],
}

const ALL = [kahalKadosh, sonsOfIsrael, lowerMerion, chabadMainLine, bnaiAbraham]

// Sunset resolves to 7:24 PM at every shul's own location below — real
// shuls a few miles apart don't see meaningfully different sunsets, and
// what these tests care about is the offset arithmetic, not the real
// fetched value. Keyed by each shul's own geoKey (not the community
// default) since every fixture above carries its own coordinates.
const ANCHORS = Object.fromEntries(
  [sonsOfIsrael, lowerMerion, chabadMainLine, bnaiAbraham].map((s) => [geoKey(s.geo!), { sunsetIso: '2026-09-08T19:24:00-04:00' }]),
)

describe('nextUpcomingDavening', () => {
  it('1:15 PM: the single next thing, one shul, no tie', () => {
    const result = nextUpcomingDavening(ALL, {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 13 * 60 + 15,
      season: 'summer',
      anchors: ANCHORS,
    })

    expect(result).toEqual({
      label: 'Mincha',
      time: '2:00pm',
      minutes: 14 * 60, // 2:00pm
      isTomorrow: false,
      shul: { name: 'Kahal Kadosh Mikveh Israel', geo: kahalKadosh.geo },
      shulCount: 1,
      shulGeos: [kahalKadosh.geo],
    })
  })

  it('7:10 PM: two shuls tied at the identical resolved minute collapse; a five-minute-earlier one does not join them', () => {
    const result = nextUpcomingDavening(ALL, {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 19 * 60 + 10,
      season: 'summer',
      anchors: ANCHORS,
    })

    expect(result?.time).toBe('7:14 PM')
    expect(result?.shulCount).toBe(2)
    expect(result?.shul).toBeNull() // collapsed — no single shul to name
    expect(new Set(result?.shulGeos)).toEqual(new Set([lowerMerion.geo, chabadMainLine.geo]))
    // Sons of Israel's 7:09 already passed by 7:10 — it must not be pulled
    // into this group just for being close.
    expect(result?.shulGeos).not.toContainEqual(sonsOfIsrael.geo)
  })

  it("10:30 PM: nothing left today falls through to tomorrow's earliest — a real tie between the two shuls that actually open at 6:45 on a Wednesday", () => {
    // Lower Merion's fixture above only covers mon/thu at 6:45 — its real
    // Wednesday Shacharis is a separate, later row this test doesn't carry —
    // so it correctly sits out of tomorrow's tie group here.
    const result = nextUpcomingDavening(ALL, {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 22 * 60 + 30,
      season: 'summer',
      anchors: ANCHORS,
    })

    expect(result?.isTomorrow).toBe(true)
    expect(result?.time).toBe('6:45am')
    expect(result?.shulCount).toBe(2)
    expect(result?.shul).toBeNull()
    expect(new Set(result?.shulGeos)).toEqual(new Set([sonsOfIsrael.geo, chabadMainLine.geo]))
  })

  it('returns null when nothing resolves at all', () => {
    const result = nextUpcomingDavening([bnaiAbraham], {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 0,
      season: 'summer',
      anchors: {},
    })
    expect(result).toBeNull()
  })

  it('excludes an out-of-season row from candidacy entirely, not just dims it', () => {
    const winterOnly: ShulMinyanim = {
      name: 'Winter Shul',
      minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '1:00pm', season: 'winter' }],
    }
    const result = nextUpcomingDavening([winterOnly], {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 12 * 60,
      season: 'summer',
      anchors: {},
    })
    expect(result).toBeNull()
  })

  it('never matches a Rosh Chodesh/holiday-only row against a plain weekday', () => {
    const roshChodeshOnly: ShulMinyanim = {
      name: 'Rosh Chodesh Shul',
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['rosh_chodesh'], time: '7:00am' }],
    }
    const result = nextUpcomingDavening([roshChodeshOnly], {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 0,
      season: 'summer',
      anchors: {},
    })
    expect(result).toBeNull()
  })

  it('matches a Yom Tov-only row when the caller has resolved today as Yom Tov', () => {
    const yomTovOnly: ShulMinyanim = {
      name: 'Yom Tov Shul',
      minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['yom_tov'], time: '8:30am' }],
    }
    const notYomTov = nextUpcomingDavening([yomTovOnly], {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 0,
      season: 'summer',
      anchors: {},
    })
    expect(notYomTov).toBeNull()

    const isYomTov = nextUpcomingDavening([yomTovOnly], {
      today: ['tue', 'yom_tov'],
      tomorrow: ['wed'],
      nowMinutes: 0,
      season: 'summer',
      anchors: {},
    })
    expect(isYomTov?.time).toBe('8:30am')
    expect(isYomTov?.shul?.name).toBe('Yom Tov Shul')
  })

  it('joins distinct tefillah labels when different tefillah types genuinely tie', () => {
    const shulA: ShulMinyanim = { name: 'Shul A', minyanim: [{ id: 'm1', tefillah: 'shacharis', days: ['tue'], time: '6:45am' } as Minyan] }
    const shulB: ShulMinyanim = { name: 'Shul B', minyanim: [{ id: 'm1', tefillah: 'mincha', days: ['tue'], time: '6:45am' } as Minyan] }
    const result = nextUpcomingDavening([shulA, shulB], {
      today: ['tue'],
      tomorrow: ['wed'],
      nowMinutes: 0,
      season: 'summer',
      anchors: {},
    })
    expect(result?.label).toBe('Shacharis & Mincha')
    expect(result?.shulCount).toBe(2)
  })
})

describe('formatStartsIn', () => {
  it('exactly at the target reads as "Now", not "In 0 min"', () => {
    expect(formatStartsIn(13 * 60, 13 * 60, false)).toBe('Now')
  })

  it('under an hour away', () => {
    expect(formatStartsIn(13 * 60, 13 * 60 + 12, false)).toBe('In 12 min')
  })

  it('exactly one hour away — no dangling "0 min"', () => {
    expect(formatStartsIn(13 * 60, 14 * 60, false)).toBe('In 1 hr')
  })

  it('over an hour away, with minutes left over', () => {
    expect(formatStartsIn(13 * 60, 14 * 60 + 12, false)).toBe('In 1 hr 12 min')
  })

  it('several hours away', () => {
    expect(formatStartsIn(6 * 60, 8 * 60, false)).toBe('In 2 hr')
  })

  it('tomorrow — target is measured from the NEXT day\'s midnight, 24h ahead of today\'s', () => {
    // 11pm tonight, tomorrow's minyan at 7am: 8 hours away.
    expect(formatStartsIn(23 * 60, 7 * 60, true)).toBe('In 8 hr')
  })
})

describe('shulRowByShul', () => {
  const opts = (nowMinutes: number, anchors = {}) => ({ today: ['mon' as const], tomorrow: ['tue' as const], nowMinutes, season: null, anchors })
  const kk = { ...kahalKadosh, id: 'kk' }
  const m = (over: Partial<Minyan>): Minyan => ({ id: 'x', tefillah: 'shacharis', days: ['sat'], time: '9:00am', ...over })
  const shul = (id: string, minyanim: Minyan[]): ShulMinyanim => ({ id, name: id, minyanim })

  it('gives each shul its own next minyan, keyed by listing id, in one clock style', () => {
    // 7:00 AM Monday: Shacharis at 7:15 is next.
    expect(shulRowByShul([kk], opts(7 * 60))).toEqual({ kk: { text: 'Shacharis 7:15 AM', tone: 'minyan' } })
    // 10 AM: Shacharis is over; Mincha at 2:00pm, written "2 PM".
    expect(shulRowByShul([kk], opts(10 * 60)).kk.text).toBe('Mincha 2 PM')
  })

  it('says "tomorrow" once today’s are over', () => {
    expect(shulRowByShul([kk], opts(15 * 60)).kk.text).toBe('Mincha 2 PM tomorrow')
  })

  it('says what a shul with nothing today or tomorrow has instead, quietly', () => {
    const rows = shulRowByShul(
      [
        shul('none', []),
        shul('shabbos', [m({ days: ['sat'] }), m({ tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm' })]),
        shul('thursday', [m({ days: ['thu'] })]),
        // Friday evening is erev Shabbos, whatever it's called.
        shul('erev', [m({ days: ['sat'] }), m({ tefillah: 'mincha_maariv', days: ['fri'], time: '7:00pm' })]),
        // Friday morning is a weekday.
        shul('friday', [m({ days: ['fri'], time: '7:00am' })]),
      ],
      opts(7 * 60),
    )
    expect(rows).toEqual({
      none: { text: 'No davening times listed', tone: 'quiet' },
      shabbos: { text: 'Shabbos only', tone: 'quiet' },
      thursday: { text: 'Nothing today or tomorrow', tone: 'quiet' },
      erev: { text: 'Shabbos only', tone: 'quiet' },
      friday: { text: 'Nothing today or tomorrow', tone: 'quiet' },
    })
  })

  it('carries the note on the minyan the row names', () => {
    const zoom = shul('zoom', [m({ days: ['mon'], time: '8:00am', notes: 'Zoom' })])
    expect(shulRowByShul([zoom], opts(7 * 60)).zoom).toEqual({ text: 'Shacharis 8 AM', tone: 'minyan', note: 'Zoom' })
  })

  it('says a minyan today with words for a time under the next one, which skips it', () => {
    const bnai = shul('bnai', [
      m({ tefillah: 'mincha_maariv', days: ['mon'], time: 'Call to Confirm' }),
      m({ days: ['tue'], time: '7:15am' }),
    ])
    expect(shulRowByShul([bnai], opts(15 * 60)).bnai).toEqual({
      text: 'Shacharis 7:15 AM tomorrow',
      tone: 'minyan',
      note: 'Mincha & Maariv today: call to confirm',
    })
  })

  it('gives a Shabbos-only shul the note all its minyanim share, and not two different ones', () => {
    const monthly = shul('monthly', [m({ notes: 'Meets the first weekend of every month' })])
    const two = shul('two', [m({ notes: 'Ends at 12:15pm' }), m({ tefillah: 'kabbalas_shabbos', days: ['fri'], time: '6:00pm', notes: 'Ends at 7:30pm' })])
    const rows = shulRowByShul([monthly, two], opts(7 * 60))
    expect(rows.monthly.note).toBe('Meets the first weekend of every month')
    expect(rows.two.note).toBeUndefined()
  })

  it('says nothing yet for a shul whose sunset-based times haven’t arrived: "nothing today" may not be true', () => {
    const sunset = shul('sunset', [m({ tefillah: 'mincha', days: ['mon'], time: '10 min before sunset', anchor: 'sunset', offsetMinutes: -10 })])
    expect(shulRowByShul([sunset], opts(7 * 60))).toEqual({})
  })

  it('leaves out a shul with no listing id', () => {
    const { id: _id, ...noId } = kk
    void _id
    expect(shulRowByShul([noId], opts(7 * 60))).toEqual({})
  })
})
