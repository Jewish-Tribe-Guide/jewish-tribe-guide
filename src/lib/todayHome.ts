import type { DirectoryResource, ZmanEntry, ZmanimData } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { itemsField } from '@/lib/listingView'
import { getOpenStatus } from '@/lib/hours'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { dayInTimezone } from '@/lib/activity'

// ── The Today home (step 6) ─────────────────────────────────────────────────
// The home page that changes with the day, behind SiteSettings.homeStyle.
// What it says is worked out here, so each kind of day can be tested with a
// fixed clock.

/** The small line above the title: "Tuesday, Oct 6 · 25 Tishrei · sunset
 *  6:35 PM". Friday and Shabbos say "Shabbos" and leave sunset to the
 *  candles card; so does Yom Tov. The Hebrew date and sunset come with the
 *  zmanim, so until they arrive the line is the date alone. Null before
 *  there's a clock (the server render), so nothing says the wrong day. */
export function dayLine(now: number | null, timezone: string, zmanim: ZmanimData | null): string | null {
  if (now === null) return null
  const at = new Date(now)
  const weekday = at.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })
  const shabbos = weekday === 'Saturday'
  const parts = [`${shabbos ? 'Shabbos' : weekday}, ${date}`]
  // "25 Tishrei 5787": the year says nothing anyone needs today. Only when
  // the zmanim are today's: a cached copy from yesterday would be a day off.
  const hebrew = zmanim && zmanimAreFor(zmanim, at, timezone) ? zmanim.hebrewDate.replace(/\s+\d{4}$/, '') : ''
  if (hebrew) parts.push(hebrew)
  const ordinaryDay = !shabbos && weekday !== 'Friday' && !zmanim?.isYomTov
  const sunset = zmanim?.dailyZmanim.find((z) => z.label === 'Sunset')?.time
  if (hebrew && ordinaryDay && sunset) parts.push(`sunset ${sunset}`)
  return parts.join(' · ')
}

/** Whether these zmanim are for the day it is: their weekday matches. */
function zmanimAreFor(zmanim: ZmanimData, at: Date, timezone: string): boolean {
  const weekday = at.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][zmanim.dayOfWeek] === weekday
}

// ── Shabbos and Yom Tov ─────────────────────────────────────────────────────

/** Where the day stands. 'erev': Friday or Erev Yom Tov, before candles.
 *  'shabbos': from candles to havdalah, Shabbos or Yom Tov. 'weekday': any
 *  other time, Motzei Shabbos included. */
export type ShabbosMoment =
  | { kind: 'weekday' }
  | { kind: 'erev'; candles: ZmanEntry; ends: ZmanEntry | null; name: string | null; yomTov: boolean }
  | { kind: 'shabbos'; ends: ZmanEntry | null; name: string | null; yomTov: boolean }

/** Worked out from the zmanim's own instants, so it's the same answer
 *  wherever the device is. Until the zmanim arrive it's an ordinary day,
 *  which shows nothing about candles rather than something wrong.
 *
 *  Inside Yom Tov: between the coming period's first candles and its end
 *  (its second night's candles are still Yom Tov, not an Erev). Inside
 *  Shabbos: havdalah is ahead, and less than a day ahead. */
export function shabbosMoment(zmanim: ZmanimData | null, now: number, timezone: string): ShabbosMoment {
  if (!zmanim) return { kind: 'weekday' }
  const at = (z: ZmanEntry) => Date.parse(z.iso!)
  const period = zmanim.holidayPeriod
  const shabbosName = zmanim.parsha ? `Shabbos ${zmanim.parsha.replace(/^Parashat\s+/, '')}` : null
  const havdalah = zmanim.shabbos.havdalah?.iso ? zmanim.shabbos.havdalah : null

  if (period?.begins.iso && period.ends.iso && at(period.begins) <= now && now < at(period.ends)) {
    return { kind: 'shabbos', ends: period.ends, name: period.name, yomTov: true }
  }
  if (havdalah && at(havdalah) > now && at(havdalah) - now < SHABBOS_MS && !isTonight(zmanim.shabbos.candleLighting, now, timezone)) {
    return { kind: 'shabbos', ends: havdalah, name: shabbosName, yomTov: false }
  }
  const yomTovTonight = period?.begins.iso && isTonight(period.begins, now, timezone) ? period.begins : null
  const shabbosTonight = isTonight(zmanim.shabbos.candleLighting, now, timezone) ? zmanim.shabbos.candleLighting! : null
  const candles = yomTovTonight ?? shabbosTonight
  if (candles) {
    const yomTov = candles === yomTovTonight
    return { kind: 'erev', candles, ends: yomTov ? period!.ends : havdalah, name: yomTov ? period!.name : shabbosName, yomTov }
  }
  return { kind: 'weekday' }
}

/** Shabbos is about 25 hours, candles to havdalah. */
const SHABBOS_MS = 26 * 60 * 60 * 1000

/** Candles today, in the community's day, still ahead. */
function isTonight(z: ZmanEntry | null | undefined, now: number, timezone: string): boolean {
  if (!z?.iso) return false
  const at = Date.parse(z.iso)
  return at > now && dayInTimezone(timezone, new Date(at)) === dayInTimezone(timezone, new Date(now))
}

// ── Before candles ──────────────────────────────────────────────────────────

export type ShoppingRow = {
  store: DirectoryResource
  category: CategoryConfig
  /** The admin's items this store's list has, in the admin's order. */
  has: string[]
  miles: number | null
}

/** Friday's shopping, as few stores as it takes: the nearest store open now
 *  whose list has the most of the admin's items, then the same for whatever
 *  it doesn't have. An item is on a store's list when an item there is
 *  named exactly that (any capitals): "Chicken" isn't "Chicken soup".
 *  `missing`: the items no store open now lists. */
export function beforeCandles(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  items: readonly string[],
  now: Date,
  from: LatLng,
): { rows: ShoppingRow[]; missing: string[] } {
  const stores: ShoppingRow[] = []
  for (const category of categories) {
    const field = itemsField(category)
    if (!field) continue
    const hoursKeys = category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
    for (const store of listings) {
      if (store.category !== category.id) continue
      if (hoursKeys.length === 0 || !getOpenStatus(store as Record<string, unknown>, hoursKeys, now).isOpen) continue
      const listed = new Set([...selectValues(store[field.key]), ...selectValues(store[`${field.key}_sometimes`])].map((t) => t.trim().toLowerCase()))
      const has = items.filter((i) => listed.has(i.trim().toLowerCase()))
      if (has.length === 0) continue
      stores.push({ store, category, has, miles: store.geo ? haversineMiles(from, store.geo) : null })
    }
  }
  const rows: ShoppingRow[] = []
  let left = [...items]
  while (left.length > 0) {
    const best = stores
      .map((s) => ({ ...s, has: s.has.filter((i) => left.includes(i)) }))
      .filter((s) => s.has.length > 0)
      .sort((a, b) => b.has.length - a.has.length || (a.miles ?? Infinity) - (b.miles ?? Infinity))[0]
    if (!best) break
    rows.push(best)
    left = left.filter((i) => !best.has.includes(i))
  }
  return { rows, missing: left }
}

const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six']

/** "Trader Joe’s, 0.2 mi, has all three"; "Spruce Market, 0.4 mi". */
export function shoppingTitle(row: ShoppingRow, asked: number): string {
  const where = row.miles != null ? `, ${milesText(row.miles)}` : ''
  const all = asked > 1 && row.has.length === asked ? `, has all ${COUNT_WORDS[asked] ?? asked}` : ''
  return `${row.store.name}${where}${all}`
}

/** "Challah, wine and chicken": the first capitalised, as a list reads. */
export function itemList(items: readonly string[]): string {
  const said = items.map((i, n) => (n === 0 ? i : i.toLowerCase()))
  return said.length <= 1 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`
}

// ── Open now ────────────────────────────────────────────────────────────────

/** What the open-now block is called at this time of day: the meal people
 *  are looking for. Late at night it's just what's open. */
export function openNowTitle(minutes: number): string {
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'Breakfast, open now'
  if (minutes >= 11 * 60 && minutes < 16 * 60) return 'Lunch, open now'
  if (minutes >= 16 * 60 && minutes < 22 * 60) return 'Dinner, open now'
  return 'Open now'
}
