import { describe, expect, it } from 'vitest'
import type { ZmanimData } from '@/types'
import { beforeCandles, browseLine, dayLine, itemList, openNowTitle, shabbosMoment, shoppingTitle } from './todayHome'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import type { CategoryField } from './categories'

const NY = 'America/New_York'
const zmanim = (over: Partial<ZmanimData> = {}) =>
  ({
    hebrewDate: '25 Tishrei 5787',
    dayOfWeek: 2,
    isFriday: false,
    isShabbos: false,
    dailyZmanim: [{ label: 'Sunset', time: '6:35 PM' }],
    shabbos: { candleLighting: null, havdalah: null },
    ...over,
  }) as ZmanimData

describe('the day line', () => {
  it('a weekday: the date, the Hebrew date without the year, and sunset', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, zmanim())).toBe('Tuesday, Oct 6 · 25 Tishrei · sunset 6:35 PM')
  })

  it('Friday leaves sunset to the candles card', () => {
    expect(dayLine(Date.parse('2026-10-09T17:30:00Z'), NY, zmanim({ hebrewDate: '28 Tishrei 5787', dayOfWeek: 5, isFriday: true }))).toBe('Friday, Oct 9 · 28 Tishrei')
  })

  it('Saturday is Shabbos', () => {
    expect(dayLine(Date.parse('2026-10-10T15:00:00Z'), NY, zmanim({ hebrewDate: '29 Tishrei 5787', dayOfWeek: 6, isShabbos: true }))).toBe('Shabbos, Oct 10 · 29 Tishrei')
  })

  it('Yom Tov leaves sunset out too', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, zmanim({ isYomTov: true }))).toBe('Tuesday, Oct 6 · 25 Tishrei')
  })

  it('the community’s day, not the device’s: 12:30 AM Tuesday in New York is Monday in Los Angeles', () => {
    const at = Date.parse('2026-10-06T04:30:00Z')
    expect(dayLine(at, NY, null)).toBe('Tuesday, Oct 6')
    expect(dayLine(at, 'America/Los_Angeles', null)).toBe('Monday, Oct 5')
  })

  it('before the zmanim arrive, the date alone; yesterday’s zmanim are not used', () => {
    expect(dayLine(Date.parse('2026-10-06T16:30:00Z'), NY, null)).toBe('Tuesday, Oct 6')
    expect(dayLine(Date.parse('2026-10-07T16:30:00Z'), NY, zmanim())).toBe('Wednesday, Oct 7')
  })

  it('nothing before there’s a clock', () => {
    expect(dayLine(null, NY, zmanim())).toBeNull()
  })
})

// This week, as Hebcal gives it for Philadelphia: candles Friday Oct 9 at
// 6:12 PM, havdalah Saturday at 7:09 PM; and a Yom Tov the next week.
const week = (over: Partial<ZmanimData> = {}) =>
  zmanim({
    parsha: 'Parashat Bereshit',
    shabbos: {
      candleLighting: { label: 'Friday', time: '6:12 PM', iso: '2026-10-09T18:12:00-04:00' },
      havdalah: { label: 'Saturday', time: '7:09 PM', iso: '2026-10-10T19:09:00-04:00' },
    },
    ...over,
  })
const nextYomTov = {
  name: 'Sukkot',
  begins: { label: 'Wednesday', time: '6:20 PM', iso: '2026-10-14T18:20:00-04:00' },
  candleLightings: [
    { label: 'Wednesday', time: '6:20 PM', iso: '2026-10-14T18:20:00-04:00' },
    { label: 'Thursday', time: '7:18 PM', iso: '2026-10-15T19:18:00-04:00' },
  ],
  ends: { label: 'Friday', time: '7:16 PM', iso: '2026-10-16T19:16:00-04:00' },
}
const t = (iso: string) => Date.parse(iso)

describe('where the day stands', () => {
  it('Friday afternoon: before candles, with the parsha', () => {
    const m = shabbosMoment(week(), t('2026-10-09T13:30:00-04:00'), NY)
    expect(m).toMatchObject({ kind: 'erev', name: 'Shabbos Bereshit', yomTov: false })
    expect(m.kind === 'erev' && [m.candles.time, m.ends?.time]).toEqual(['6:12 PM', '7:09 PM'])
  })

  it('Friday a minute before candles is still Erev Shabbos; a minute after is Shabbos', () => {
    expect(shabbosMoment(week(), t('2026-10-09T18:11:00-04:00'), NY).kind).toBe('erev')
    expect(shabbosMoment(week(), t('2026-10-09T18:13:00-04:00'), NY)).toMatchObject({ kind: 'shabbos', ends: { time: '7:09 PM' } })
  })

  it('Shabbos day, until havdalah; then an ordinary evening', () => {
    expect(shabbosMoment(week({ isShabbos: true }), t('2026-10-10T11:00:00-04:00'), NY).kind).toBe('shabbos')
    expect(shabbosMoment(week({ isShabbos: true }), t('2026-10-10T19:10:00-04:00'), NY).kind).toBe('weekday')
  })

  it('Motzei Shabbos with a Yom Tov the next week is still an ordinary evening', () => {
    expect(shabbosMoment(week({ isShabbos: true, holidayPeriod: nextYomTov }), t('2026-10-10T21:00:00-04:00'), NY).kind).toBe('weekday')
  })

  it('a Tuesday is an ordinary day', () => {
    expect(shabbosMoment(week(), t('2026-10-06T12:30:00-04:00'), NY).kind).toBe('weekday')
  })

  it('Erev Yom Tov: before the first candles, named for the Yom Tov', () => {
    const m = shabbosMoment(week({ holidayPeriod: nextYomTov }), t('2026-10-14T14:00:00-04:00'), NY)
    expect(m).toMatchObject({ kind: 'erev', name: 'Sukkot', yomTov: true, candles: { time: '6:20 PM' }, ends: { time: '7:16 PM' } })
  })

  it('the first day of Yom Tov is Yom Tov, though its second night has candles', () => {
    expect(shabbosMoment(week({ holidayPeriod: nextYomTov, isYomTov: true }), t('2026-10-15T12:00:00-04:00'), NY)).toMatchObject({ kind: 'shabbos', yomTov: true, name: 'Sukkot' })
  })

  it('nothing is said before the zmanim arrive', () => {
    expect(shabbosMoment(null, t('2026-10-09T13:30:00-04:00'), NY).kind).toBe('weekday')
  })
})

describe('before candles', () => {
  const items: CategoryField = { key: 'm', label: 'Items', type: 'tags', showCountInHeader: true }
  const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
  const grocery = makeCategory({ id: 'grocery', label: 'Grocery', detailFields: [hours, items] })
  // Open every day, 9 AM to 9 PM.
  const open = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
  const store = (id: string, lat: number, m: string[], h: unknown = open, sometimes: string[] = []) =>
    makeListing({ id, name: id, category: 'grocery', geo: { lat, lng: 0 }, hours: h, m, m_sometimes: sometimes })
  const from = { lat: 0, lng: 0 }
  // Local time, as every hours test here: whether a place is open is read
  // off the device's clock (see getOpenStatus).
  const friday = new Date(2026, 9, 9, 13, 30)

  it('one store that has them all, the nearest of those', () => {
    const { rows, missing } = beforeCandles(
      [store('Far', 0.02, ['Challah', 'Wine', 'Chicken']), store('Near', 0.003, ['challah', 'WINE', 'Chicken']), store('Nearer', 0.001, ['Challah'])],
      [grocery],
      ['Challah', 'Wine', 'Chicken'],
      friday,
      from,
    )
    expect(rows.map((r) => [r.store.name, r.has])).toEqual([['Near', ['Challah', 'Wine', 'Chicken']]])
    expect(missing).toEqual([])
    expect(shoppingTitle(rows[0], 3)).toBe('Near, 0.2 mi, has all three')
  })

  it('no one store: as few as it takes; an item no store open now lists is said', () => {
    const { rows, missing } = beforeCandles(
      [store('A', 0.001, ['Challah', 'Wine']), store('B', 0.002, ['Wine']), store('C', 0.003, ['Chicken soup'])],
      [grocery],
      ['Challah', 'Wine', 'Chicken'],
      friday,
      from,
    )
    expect(rows.map((r) => [r.store.name, r.has])).toEqual([['A', ['Challah', 'Wine']]])
    expect(missing).toEqual(['Chicken'])
  })

  it('a store closed now, or with no hours, isn’t an answer; "sometimes" items count', () => {
    const closed = Object.fromEntries(['fri'].map((d) => [d, { open: '15:00', close: '21:00' }]))
    const { rows } = beforeCandles(
      [store('Closed', 0.001, ['Challah'], closed), store('NoHours', 0.001, ['Challah'], null), store('Sometimes', 0.01, [], open, ['Challah'])],
      [grocery],
      ['Challah'],
      friday,
      from,
    )
    expect(rows.map((r) => r.store.name)).toEqual(['Sometimes'])
  })

  it('the items read as a list', () => {
    expect(itemList(['Challah', 'Wine', 'Chicken'])).toBe('Challah, wine and chicken')
    expect(itemList(['Challah'])).toBe('Challah')
  })
})

describe('open now', () => {
  it('is named for the meal', () => {
    expect(openNowTitle(9 * 60)).toBe('Breakfast, open now')
    expect(openNowTitle(12 * 60 + 30)).toBe('Lunch, open now')
    expect(openNowTitle(19 * 60)).toBe('Dinner, open now')
    expect(openNowTitle(23 * 60)).toBe('Open now')
  })
})

describe('a Browse row’s live line: what the category’s own page says first', () => {
  const hours: CategoryField = { key: 'hours', label: 'Hours', type: 'hours' }
  const shabbat: CategoryField = { key: 'sf', label: 'Shabbat friendly', type: 'boolean' }
  const denomination: CategoryField = { key: 'den', label: 'Denomination', type: 'select', options: [{ value: 'Orthodox', label: 'Orthodox' }] }
  const open = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '21:00' }]))
  const shut = { tue: { open: '15:00', close: '16:00' } }
  // Local time, as every hours test here (see getOpenStatus).
  const tuesday = new Date(2026, 9, 6, 12, 30)
  const food = makeCategory({ id: 'restaurant', detailFields: [hours], groupBy: { kind: 'open' } })
  const places = [makeListing({ id: 'a', category: 'restaurant', hours: open }), makeListing({ id: 'b', category: 'restaurant', hours: open }), makeListing({ id: 'c', category: 'restaurant', hours: shut })]

  it('grouped by open now: how many are open', () => {
    expect(browseLine(food, places, tuesday, false)).toBe('2 open now')
  })

  it('nothing open now on Shabbos or Yom Tov, as on the Today home', () => {
    expect(browseLine(food, places, tuesday, true)).toBeNull()
  })

  it('none open: the page leads with "Not open now", so the row says nothing', () => {
    expect(browseLine(food, [places[2]], tuesday, false)).toBeNull()
  })

  it('grouped by a yes/no: how many say yes, in the admin’s words', () => {
    const hotels = makeCategory({ id: 'hotel', detailFields: [shabbat], groupBy: { kind: 'field', key: 'sf' } })
    const rows = [makeListing({ id: 'h1', category: 'hotel', sf: true }), makeListing({ id: 'h2', category: 'hotel' })]
    expect(browseLine(hotels, rows, tuesday, true)).toBe('1 Shabbat friendly')
  })

  it('grouped by distance: how many are within it', () => {
    const grocery = makeCategory({ id: 'grocery', groupBy: { kind: 'distance', miles: 2 } })
    const rows = [makeListing({ id: 'g1', category: 'grocery', milesFromAddress: 0.5 }), makeListing({ id: 'g2', category: 'grocery', milesFromAddress: 9 })]
    expect(browseLine(grocery, rows, tuesday, false)).toBe('1 within 2 mi')
  })

  it('nothing for a pick-list (no group comes first), or a page with no groups', () => {
    const shuls = makeCategory({ id: 'synagogue', detailFields: [denomination], groupBy: { kind: 'field', key: 'den' } })
    expect(browseLine(shuls, [makeListing({ id: 's', category: 'synagogue', den: 'Orthodox' })], tuesday, false)).toBeNull()
    expect(browseLine({ ...food, groupBy: null }, places, tuesday, false)).toBeNull()
  })
})
