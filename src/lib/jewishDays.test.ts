import { describe, expect, it } from 'vitest'
import { calendarDaysFrom, readHebcalDay } from './jewishDays'

// Titles exactly as Hebcal sends them (checked against its API, Oct 1 2026),
// curly apostrophes and all.
describe('a Hebcal title, read as a day', () => {
  it('Yom Tov days, in the guide’s spelling, with their festival', () => {
    expect(readHebcalDay('Sukkot I')).toEqual({ yomTov: true, cholHamoed: false, name: 'Sukkos', festival: 'Sukkos' })
    expect(readHebcalDay('Shmini Atzeret')).toEqual({ yomTov: true, cholHamoed: false, name: 'Shemini Atzeres', festival: 'Sukkos' })
    expect(readHebcalDay('Simchat Torah')).toEqual({ yomTov: true, cholHamoed: false, name: 'Simchas Torah', festival: 'Sukkos' })
    expect(readHebcalDay('Rosh Hashana 5787')?.name).toBe('Rosh Hashanah')
    expect(readHebcalDay('Rosh Hashana II')?.yomTov).toBe(true)
    expect(readHebcalDay('Yom Kippur')?.yomTov).toBe(true)
    expect(readHebcalDay('Pesach VIII')?.yomTov).toBe(true)
    expect(readHebcalDay('Shavuot II')).toMatchObject({ yomTov: true, name: 'Shavuos' })
  })

  it('Chol HaMoed, however many apostrophes Hebcal uses', () => {
    for (const t of ['Sukkot VI (CH’’M)', "Sukkot VI (CH''M)", 'Pesach III (CH’M)']) {
      expect(readHebcalDay(t), t).toMatchObject({ yomTov: false, cholHamoed: true, name: 'Chol HaMoed' })
    }
  })

  it('Hoshana Rabbah is Chol HaMoed, not Yom Tov, though it starts “Sukkot”', () => {
    expect(readHebcalDay('Sukkot VII (Hoshana Raba)')).toEqual({ yomTov: false, cholHamoed: true, name: 'Hoshana Rabbah', festival: 'Sukkos' })
  })

  it('the lead-up is named, not Yom Tov', () => {
    expect(readHebcalDay('Erev Sukkot')).toEqual({ yomTov: false, cholHamoed: false, name: 'Erev Sukkos', festival: 'Sukkos' })
    expect(readHebcalDay('Erev Yom Kippur')?.yomTov).toBe(false)
  })

  it('not a festival day at all: names that only begin like one, and the rest', () => {
    for (const t of ['Yom Kippur Katan', 'Pesach Sheni', 'Rosh Hashana LaBehemot', 'Rosh Chodesh Cheshvan', 'Chanukah: 1 Candle', 'Tzom Gedaliah', 'Parashat Bereshit']) {
      expect(readHebcalDay(t), t).toBeNull()
    }
  })
})

describe('the days ahead', () => {
  // Hebcal's own response for Philadelphia, Sep 30 – Oct 8 2026.
  const items = [
    { category: 'holiday', title: 'Sukkot V (CH’’M)', date: '2026-09-30' },
    { category: 'holiday', title: 'Sukkot VI (CH’’M)', date: '2026-10-01' },
    { category: 'holiday', title: 'Sukkot VII (Hoshana Raba)', date: '2026-10-02' },
    { category: 'candles', title: 'Candle lighting: 6:23pm', date: '2026-10-02T18:23:00-04:00' },
    { category: 'holiday', title: 'Shmini Atzeret', date: '2026-10-03' },
    { category: 'candles', title: 'Candle lighting: 7:20pm', date: '2026-10-03T19:20:00-04:00' },
    { category: 'holiday', title: 'Simchat Torah', date: '2026-10-04' },
    { category: 'havdalah', title: 'Havdalah: 7:18pm', date: '2026-10-04T19:18:00-04:00' },
  ]

  it('each festival day in the range, named, from today on', () => {
    expect(calendarDaysFrom(items, '2026-10-01', '2026-10-07').map((d) => [d.date, d.name, d.yomTov])).toEqual([
      ['2026-10-01', 'Chol HaMoed', false],
      ['2026-10-02', 'Hoshana Rabbah', false],
      ['2026-10-03', 'Shemini Atzeres', true],
      ['2026-10-04', 'Simchas Torah', true],
    ])
  })
})
