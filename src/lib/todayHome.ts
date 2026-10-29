import type { DirectoryResource, ZmanEntry, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { itemsField } from '@/lib/listingView'
import { listingHas } from '@/lib/itemFilter'
import { businessClosure, hoursOpenNow } from '@/lib/hours'
import { haversineMiles, milesText, type LatLng } from '@/lib/geo'
import { dayInTimezone } from '@/lib/activity'
import { groupListings } from '@/lib/listGroups'
import { routes } from '@/lib/routes'

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

export type CandleItemRow = {
  /** The admin's name for it: "Challah". */
  item: string
  /** Where it's kept: Grocery, and its items field. */
  category: CategoryConfig
  fieldKey: string
  /** How many stores open now have it, always or sometimes. */
  stores: number
  /** The nearest of them, when any says where it is. */
  closest: number | null
}

/** Friday's shopping, one row per item (the user, Oct 28: "people don't want
 *  to see one store"): how many stores open now have it, and how near the
 *  nearest is. Each row opens Grocery with "Has: Challah" and "Open now" on,
 *  so it counts the way those filters do (listingHas, the page's own open-now
 *  check in searchLands' withFilters): the number is the list it opens.
 *
 *  One category answers for every row: the one whose places open now carry
 *  the most of the items, nearly always Grocery. Food keeps an item list too
 *  (its main dishes), and a restaurant's chicken dish is not where you buy
 *  chicken for Shabbos; nor should one row open Grocery and the next Food.
 *  `missing`: the items none of its places open now lists. */
export function beforeCandles(
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  items: readonly string[],
  now: Date,
  from: LatLng,
): { rows: CandleItemRow[]; missing: string[] } {
  let best: { rows: CandleItemRow[]; missing: string[]; found: number } | null = null
  for (const category of categories) {
    const field = itemsField(category)
    // Without a filterable hours field the page has no "Open now" to turn on.
    const hours = category.detailFields.filter((f) => f.type === 'hours' && f.filterable)
    if (!field || hours.length === 0) continue
    const open = listings.filter(
      (store) =>
        store.category === category.id &&
        !businessClosure(store as unknown as Record<string, unknown>) &&
        hours.some((h) => hoursOpenNow(store[h.key], now) === true),
    )
    const rows: CandleItemRow[] = []
    const missing: string[] = []
    for (const item of items) {
      const have = open.filter((store) => listingHas(store, field.key, [item]))
      if (have.length === 0) {
        missing.push(item)
        continue
      }
      const miles = have.flatMap((s) => (s.geo ? [haversineMiles(from, s.geo)] : []))
      rows.push({ item, category, fieldKey: field.key, stores: have.length, closest: miles.length ? Math.min(...miles) : null })
    }
    const found = rows.reduce((n, r) => n + r.stores, 0)
    if (found > (best?.found ?? 0)) best = { rows, missing, found }
  }
  return best ? { rows: best.rows, missing: best.missing } : { rows: [], missing: [...items] }
}

/** Grocery with "Has: Challah" and "Open now" on: the address searchLands'
 *  categoryHref gives the same filters, built here so the home doesn't load
 *  the search's code for it. */
export function candleItemHref(communitySlug: string, row: CandleItemRow): string {
  const p = new URLSearchParams({ openNow: '1', [`has_${row.fieldKey}`]: row.item })
  return `${routes.slug(communitySlug, row.category.id)}?${p}`
}

/** "10 stores open · closest 0.2 mi"; "1 store open · 0.4 mi". */
export function candleItemLine(row: CandleItemRow): string {
  const count = `${row.stores} ${row.stores === 1 ? 'store' : 'stores'} open`
  if (row.closest == null) return count
  return `${count} · ${row.stores === 1 ? '' : 'closest '}${milesText(row.closest)}`
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

/** A Browse row's second line: what the category's own page says first, its
 *  first group when it splits its list ("59 open now", "13 within 2 mi",
 *  "3 Shabbat friendly"). Nothing for a category grouped by a pick-list (its
 *  groups are equal, none comes first), nor when the first group is the
 *  "not open now" or "doesn't say" kind. No "open now" on Shabbos or Yom Tov,
 *  as on the Today home. */
export function browseLine(
  category: CategoryConfig,
  items: readonly DirectoryResource[],
  now: Date | null,
  restDay: boolean,
): string | null {
  const grouping = groupListings(items, category, now)
  if (!grouping || grouping.closed) return null
  const first = grouping.groups[0]
  if (!first) return null
  const n = first.items.length
  if (first.id === 'open') return restDay ? null : `${n} open now`
  if (first.id === 'within') return `${n} ${first.label.toLowerCase()}`
  if (first.id === 'yes') return `${n} ${first.label}`
  return null
}
