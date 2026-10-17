import type { DirectoryResource, ZmanimData } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { getOpenStatus, hasAnyHours } from '@/lib/hours'

// ── The phone home (the user, Oct 17) ───────────────────────────────────────
// No headline and no mission: a line saying who keeps the guide right, the
// search, then "Right now" (what's open, or Shabbos), then the categories as
// tiles. What those say is worked out here, so it can be tested with a fixed
// clock.

/** Google's nightly check counts as recent for a week. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type TrustFacts = {
  /** Places in the guide's categories. */
  places: number
  /** Places ever checked against Google: none means the community doesn't
   *  sync, and the line says nothing about Google. */
  googleChecked: number
  /** Of those, checked in the last 7 days. Null before there's a clock. */
  checkedThisWeek: number | null
}

/** The trust line's numbers, from the listings the home already holds. Only
 *  places in a category the guide shows count. */
export function trustFacts(listings: readonly DirectoryResource[], categories: readonly CategoryConfig[], now: number | null): TrustFacts {
  const shown = new Set(categories.map((c) => c.id))
  const places = listings.filter((l) => shown.has(l.category))
  const synced = places.map((l) => (l.googleSyncedAt ? Date.parse(l.googleSyncedAt) : NaN)).filter((t) => !Number.isNaN(t))
  return {
    places: places.length,
    googleChecked: synced.length,
    checkedThisWeek: now === null ? null : synced.filter((t) => t <= now && now - t < WEEK_MS).length,
  }
}

/** The line under "Kept up by the … community": "155 places · hours checked
 *  with Google every night". Google is left out where nothing is checked,
 *  and, once the clock is known, where nothing was checked this week: the
 *  nightly check has stopped, so "every night" would no longer be true. */
export function trustLine(facts: TrustFacts): string {
  const places = `${facts.places} ${facts.places === 1 ? 'place' : 'places'}`
  const google = facts.googleChecked > 0 && facts.checkedThisWeek !== 0
  return google ? `${places} · hours checked with Google every night` : places
}

// ── Right now, on a weekday ─────────────────────────────────────────────────

export type OpenNowRow = {
  category: CategoryConfig
  /** Places in it open now. */
  open: number
  /** "6 meat · 20 dairy · 33 parve": the open places by the category's
   *  first pick-list a visitor can filter by, in the admin's order, at most
   *  three. Empty when it has none. */
  parts: string[]
}

/** What's open now, in the first `limit` categories (the admin's order)
 *  whose places say their hours: on Philly's home, Food and Grocery. A
 *  category with nothing open says nothing: late at night there may be no
 *  rows at all. Not on Shabbos or Yom Tov (the caller's to know). */
export function openNowRows(listings: readonly DirectoryResource[], categories: readonly CategoryConfig[], now: Date, limit = 2): OpenNowRow[] {
  const rows: OpenNowRow[] = []
  let taken = 0
  for (const category of categories) {
    if (taken >= limit) break
    if (category.kind !== 'listing') continue
    const hoursKeys = category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
    if (hoursKeys.length === 0) continue
    const places = listings.filter((l) => l.category === category.id)
    if (!places.some((p) => hoursKeys.some((k) => hasAnyHours(p[k])))) continue
    taken++
    const open = places.filter((p) => getOpenStatus(p as Record<string, unknown>, hoursKeys, now).isOpen)
    if (open.length === 0) continue
    rows.push({ category, open: open.length, parts: openParts(category, open) })
  }
  return rows
}

/** "6 meat · 20 dairy", by the first single-choice pick-list a visitor can
 *  filter the category by. The admin's own words, lower-cased and never
 *  made plural: "Meat" can't become "meats", and "Kosher Items" is plural
 *  already. */
function openParts(category: CategoryConfig, open: readonly DirectoryResource[]): string[] {
  const field = category.detailFields.find((f) => f.type === 'select' && f.filterable && !f.multiSelect && (f.options?.length ?? 0) > 0)
  if (!field) return []
  return field
    .options!.map((o) => [o.label, open.filter((p) => selectValues(p[field.key]).includes(o.value)).length] as const)
    .filter(([, n]) => n > 0)
    .slice(0, 3)
    .map(([label, n]) => `${n} ${label.toLowerCase()}`)
}

// ── The label over Right now ────────────────────────────────────────────────

/** "Tuesday · 2 Cheshvan"; Saturday is "Shabbos". The Hebrew date only when
 *  the zmanim are today's (a cached copy from yesterday would be a day
 *  off). Null before there's a clock. */
export function rightNowDay(now: number | null, timezone: string, zmanim: ZmanimData | null): string | null {
  if (now === null) return null
  const at = new Date(now)
  const weekday = at.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  const short = at.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone })
  const today = zmanim && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][zmanim.dayOfWeek] === short
  const hebrew = today ? zmanim.hebrewDate.replace(/\s+\d{4}$/, '') : ''
  return [weekday === 'Saturday' ? 'Shabbos' : weekday, hebrew].filter(Boolean).join(' · ')
}
