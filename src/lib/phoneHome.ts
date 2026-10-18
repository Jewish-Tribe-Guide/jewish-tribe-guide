import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import { getOpenStatus, hasAnyHours } from '@/lib/hours'
import { eruvView, type Eruv, type EruvTone } from '@/lib/eruv'

// ── The phone home (the user, Oct 17) ───────────────────────────────────────
// No headline and no mission: a line saying who keeps the guide right, the
// search, then "Right now" (what's open, or Shabbos), then the categories as
// tiles. What those say is worked out here, so it can be tested with a fixed
// clock.

/** Google's nightly check counts as recent for a week. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** How far ahead of the device's clock a check may seem to be. */
const SKEW_MS = 10 * 60 * 1000

export type TrustFacts = {
  /** Places in the guide's categories. */
  places: number
  /** Places ever checked against Google: none means the community doesn't
   *  sync, and the line says nothing about Google. */
  googleChecked: number
  /** Of those, checked in the last 7 days. Null before there's a clock. */
  checkedThisWeek: number | null
  /** Places that say a date on them: confirmed by someone, or updated from
   *  Google. The rest say "Not confirmed by anyone yet". */
  dated: number
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
    dated: places.filter((l) => l.confirmedAt || l.googleSyncedAt).length,
  }
}

/** Every place says a date on it. */
export const everyListingDated = (facts: TrustFacts) => facts.places > 0 && facts.dated === facts.places

/** The line under "Kept up by the community": "155 places · every listing
 *  dated" (the user, Oct 17), once that's so; until then "155 places ·
 *  hours checked with Google every night". Google is left out where nothing
 *  is checked, and, once the clock is known, where nothing was checked this
 *  week: the nightly check has stopped, so "every night" would no longer be
 *  true. */
export function trustLine(facts: TrustFacts): string {
  const places = `${facts.places} ${facts.places === 1 ? 'place' : 'places'}`
  if (everyListingDated(facts)) return `${places} · every listing dated`
  const google = facts.googleChecked > 0 && facts.checkedThisWeek !== 0
  return google ? `${places} · hours checked with Google every night` : places
}

// ── How this guide stays right (the sheet the trust line opens) ─────────────

export type SourcesRead = {
  /** Google's nightly check ran this week. */
  google: boolean
  /** Each outside list read on its own this week, by its name: "Keystone-K's
   *  list". */
  lists: string[]
  /** Some eruv's own site was read this week. */
  eruv: boolean
}

/** Which sources the guide actually read in the last week, from what the
 *  page has: the trust facts, the watched lists' last good reads
 *  (/api/sources) and the eruvim's last checks. Only these are named: a
 *  check that's set up but hasn't run claims nothing. */
export function sourcesRead(
  facts: TrustFacts,
  lists: readonly { label: string | null; okAt: string | null }[],
  eruvChecks: readonly (string | null)[],
  now: number,
): SourcesRead {
  // A phone's clock can run a few minutes behind the server's, so a check
  // made just now can look like it's still to come.
  const recent = (iso: string | null) => {
    const t = iso ? Date.parse(iso) : NaN
    return !Number.isNaN(t) && t <= now + SKEW_MS && now - t < WEEK_MS
  }
  return {
    google: facts.googleChecked > 0 && (facts.checkedThisWeek ?? 0) > 0,
    lists: lists.filter((l) => recent(l.okAt)).map((l) => l.label?.trim() || 'the kashrus agency’s list'),
    eruv: eruvChecks.some(recent),
  }
}

/** The sheet's first line, the idea with its examples (the user, Oct 17:
 *  people want the philosophy, not each source): "Hours from Google,
 *  hechshers from Keystone-K's list, eruv status from each eruv’s own site.
 *  Read again every day." The eruv's Friday rhythm is left to the Eruv page
 *  (the user, Oct 18: too much detail for an overview). Null when nothing
 *  was read, and the sheet leaves the line out. */
export function sourcesSentence(read: SourcesRead): string | null {
  const parts = [read.google && 'hours from Google', ...read.lists.map((l) => `hechshers from ${l}`), read.eruv && 'eruv status from each eruv’s own site'].filter(
    (p): p is string => !!p,
  )
  if (parts.length === 0) return null
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}. Read again every day.`
}

// ── Right now, on a weekday ─────────────────────────────────────────────────

export type OpenNowRow = {
  category: CategoryConfig
  /** Places in it open now. */
  open: number
  /** "44 kosher items tracked" where the category keeps a list of items
   *  (the user, Oct 17: that we know what's in the store is the point, and
   *  a small honest number grows). Otherwise "6 meat · 20 dairy · 33
   *  parve": the open places by the category's first pick-list a visitor
   *  can filter by, in the admin's order, at most three. Empty when it has
   *  neither. */
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
    const tracked = itemsTracked(category, places)
    rows.push({ category, open: open.length, parts: tracked ? [tracked] : openParts(category, open) })
  }
  return rows
}

/** "44 kosher items tracked": how many different things the category's
 *  counted list (the tags field shown on its rows) holds across all its
 *  places, not just the open ones, in the admin's own word for one
 *  ("kosher item", "dish"). Null without such a list, or while it's empty. */
function itemsTracked(category: CategoryConfig, places: readonly DirectoryResource[]): string | null {
  const field = category.detailFields.find((f) => f.type === 'tags' && f.showCountInHeader)
  if (!field) return null
  const names = new Set<string>()
  for (const p of places) {
    for (const key of [field.key, `${field.key}_sometimes`]) for (const name of selectValues(p[key])) if (name.trim()) names.add(name.trim().toLowerCase())
  }
  if (names.size === 0) return null
  const noun = field.countLabel?.trim().toLowerCase() || 'item'
  return `${names.size} ${names.size === 1 ? noun : plural(noun)} tracked`
}

/** "kosher items", "dishes". */
const plural = (noun: string) => (/(s|sh|ch|x|z)$/.test(noun) ? `${noun}es` : `${noun}s`)

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

/** "Tuesday"; Saturday is "Shabbos". No Hebrew date (the user, Oct 18: the
 *  phone home read as too Jewish for everyone it serves). Null before
 *  there's a clock. */
export function rightNowDay(now: number | null, timezone: string): string | null {
  if (now === null) return null
  const weekday = new Date(now).toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  return weekday === 'Saturday' ? 'Shabbos' : weekday
}

// ── The eruvim, on the Friday card ──────────────────────────────────────────

export type EruvSummary = {
  /** "Lower Merion Eruv is down", said first, in red, so it can't hide in
   *  a count. Null when none is. */
  down: string | null
  /** The rest, counted: "3 up", "1 not posted yet", "2 by phone". */
  parts: { tone: EruvTone; text: string }[]
}

/** The Friday card's line for someone who hasn't said where they are (the
 *  user, Oct 17): every eruv counted by what its status honestly is, in the
 *  Eruv page's own terms (eruvView). One with only a hotline is "by phone",
 *  never up or unknown. Null with no eruvim. */
export function eruvSummary(eruvim: readonly Eruv[], now: Date, timezone: string, candles: number | null): EruvSummary | null {
  if (eruvim.length === 0) return null
  const views = eruvim.map((e) => ({ name: e.name, view: eruvView(e, now, timezone, candles) }))
  const count = (test: (v: (typeof views)[number]['view']) => boolean) => views.filter((x) => test(x.view)).length
  const downNames = views.filter((x) => x.view.tone === 'red').map((x) => x.name)
  const notPosted = (v: { label: string }) => v.label === 'Not posted yet this week'
  const parts: EruvSummary['parts'] = []
  const add = (tone: EruvTone, n: number, text: string) => n > 0 && parts.push({ tone, text: `${n} ${text}` })
  add('green', count((v) => v.tone === 'green'), 'up')
  add('amber', count((v) => v.tone === 'amber' && notPosted(v)), 'not posted yet')
  add('amber', count((v) => v.tone === 'amber' && !notPosted(v)), 'couldn’t be read')
  add('grey', count((v) => v.label === 'No status online'), 'by phone')
  const down = downNames.length === 0 ? null : `${joinNames(downNames)} ${downNames.length === 1 ? 'is' : 'are'} down`
  return { down, parts }
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
