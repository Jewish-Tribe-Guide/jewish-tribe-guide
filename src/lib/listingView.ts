import { resolveCapabilities, selectValues, type CategoryConfig, type CategoryField } from './categories'
import { ui } from './uiConfig'
import { fmt12, getOpenStatus, hasAnyHours, isStructuredHours, DAY_KEYS, dayLabel, type DayKey, type DayHours } from './hours'

const short = (k: DayKey) => dayLabel(k).slice(0, 3)
import { haversineMiles, milesText, roundMiles } from './geo'
import { rowBadgeFields, saysTheSame } from './listingRow'
import { isMinyanim } from './davening'
import { parseWalkLists } from './walkList'
import { mainCardOf, parseListingParts } from './listingParts'
import type { DirectoryResource } from '@/types'

// ── An opened listing ────────────────────────────────────────────────────────
// Every listing opens to the same seven parts, in the same order, whatever
// its category (agreed Sep 30; the canvas's "opened listing" boards):
//
//   1 who and whether   name; kind · where · how far; status now; the facts
//                       that decide it, in the row's words ("Meat · Keystone-K")
//   2 actions           Directions, Call, links, Share: five at most
//   3 the main thing    chosen by what the listing holds (see mainThing)
//   4 details           address, phone, what didn't fit above
//   5 about             the description, with where it came from
//   6 one question      and Suggest an edit
//   7 onward            the nearest in the same category, then all of them
//
// What goes where is worked out here, from the category's fields, never from
// its name, so a category an admin makes tomorrow opens the same way.

/** A field shown as a badge: a boolean or select the admin put in the
 *  header. */
function isBadge(f: CategoryField): boolean {
  return (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge' && (f.type === 'boolean' || f.type === 'select')
}

function optionLabels(f: CategoryField, value: unknown): string[] {
  return selectValues(value).map((v) => f.options?.find((o) => o.value === v)?.label ?? v)
}

/** The tags field a category lists its items in ("Kosher items available"),
 *  when the admin put its count in the row (showCountInHeader). */
export function itemsField(category: CategoryConfig): CategoryField | null {
  return category.detailFields.find((f) => f.type === 'tags' && f.showCountInHeader) ?? null
}

/** The field that says what kind of place this is: the LAST select badge
 *  that isn't a caveat-carrying one (a hechsher) or the one an items count
 *  replaces on the row (a grocery's "Kosher Items", which is a deciding fact
 *  here, not a kind). Food's "Restaurant", a shul's "Orthodox (Ashkenazi)".
 *
 *  The last, because a category's fields put the facts that decide it first
 *  and what kind of place it is after them (agreed Sep 28, and Food's fields
 *  were reordered so on Sep 30: meat/dairy/parve, hechsher, then type). It
 *  was the first until then, and the reorder made Food's kind "Parve". */
export function kindField(category: CategoryConfig): CategoryField | null {
  const replaced = itemsField(category)?.countReplacesKey
  return category.detailFields.findLast((f) => isBadge(f) && f.type === 'select' && !f.caveat && f.key !== replaced) ?? null
}

/** "Restaurant", or the category's own name when nothing says more
 *  ("Mikvah", "WhatsApp Group"). */
export function listingKind(item: DirectoryResource, category: CategoryConfig): string {
  const f = kindField(category)
  const labels = f ? optionLabels(f, item[f.key]) : []
  return labels.length > 0 ? labels.join(', ') : category.label
}

/** The facts that decide whether this is the place, as the row says them:
 *  "Meat", "Keystone-K"; a mikvah's "Women’s", "Men’s", "Keilim"; a
 *  grocery's "Kosher store". Every filterable badge but the kind, and, as on
 *  the row, not a badge that only repeats what the items say ("Kosher
 *  Items" over a list of kosher items). */
export function listingFacts(item: DirectoryResource, category: CategoryConfig): string[] {
  const kind = kindField(category)?.key
  const items = itemsField(category)
  const hasItems = !!items && selectValues(item[items.key]).length + selectValues(item[`${items.key}_sometimes`]).length > 0
  const repeats = (f: CategoryField, label: string) => hasItems && f.key === items!.countReplacesKey && saysTheSame(label, items!)
  return rowBadgeFields(category).flatMap((f) => {
    if (f.key === kind) return []
    const labels = f.type === 'boolean' ? (item[f.key] ? [f.filterLabel ?? f.label] : []) : optionLabels(f, item[f.key])
    return labels.filter((l) => !repeats(f, l))
  })
}

/** How far, for the kind line: from the visitor when they've set a location,
 *  otherwise from the community's centre, which the list says it measures
 *  from. Nothing for a place in the centre itself: "0.2 mi from central
 *  Philadelphia" is just noise. */
export function listingDistance(item: DirectoryResource, region: string): string | null {
  if (item.milesFromAddress != null) return `${milesText(item.milesFromAddress)} away`
  if (item.milesFromCenter != null && item.milesFromCenter >= 0.5) return `${roundMiles(item.milesFromCenter)} mi from central ${region}`
  return null
}

// ── The main thing ───────────────────────────────────────────────────────────

export type MainThing = 'section' | 'davening' | 'items' | 'groups' | 'walk' | 'join'

/** What the listing is mostly for. The section an admin named as it comes
 *  first (a hospital's "Who to call first", listingParts.ts), even while
 *  it's empty, so every listing in the category opens the same way.
 *  Otherwise by what it holds, first that applies: davening times; items; one section per audience (a mikvah's women's,
 *  men's and keilim); the shuls within a walk (a hotel); the one link of a
 *  place with no address (Join a WhatsApp group). Never the hours on their
 *  own (Oct 6): they're one line of the contact box, the week a tap away,
 *  so a school opens on its address, phone and today's hours together.
 *
 *  A category that keeps an item list leads with it even while it's empty
 *  ("Main dishes", "+ Add the first dish"), so every listing in it opens
 *  the same way (agreed Oct 1, Food and Grocery). Not where nobody can add
 *  to it (edits off): an empty list would be a dead end. */
export function mainThing(item: DirectoryResource, category: CategoryConfig): MainThing | null {
  const fields = category.detailFields
  if (mainCardOf(category)) return 'section'
  const minyanim = fields.find((f) => f.type === 'minyanim')
  if (minyanim && isMinyanim(item[minyanim.key]) && (item[minyanim.key] as unknown[]).length > 0) return 'davening'
  const items = itemsField(category)
  if (items && selectValues(item[items.key]).length + selectValues(item[`${items.key}_sometimes`]).length > 0) return 'items'
  if (items && ui.contributions.edit && resolveCapabilities(category.capabilities).edit) return 'items'
  if (audienceGroups(item, category).length > 0) return 'groups'
  if (parseWalkLists(category.walkList).length > 0 && item.geo) return 'walk'
  if (primaryLink(item, category)) return 'join'
  return null
}

/** Where an opened listing asks "Still right?" (agreed Sep 30, trimmed
 *  Oct 6): beside what changes often, in its own box. A shul's times and a
 *  mikvah's hours in each section's own box (each on its own date), a named section ("Who to call first") in
 *  its card, a group's join link in its Join box (not a website's).
 *
 *  What hardly changes isn't dated at all any more. A hechsher's proof is
 *  its certificate, one tap away among the buttons, and "Kosher details
 *  last checked Aug 20" only said when someone last looked at it; meat
 *  stays meat, and when any of it does change someone edits or reports
 *  it. A grocery's items and a restaurant's dishes carry their own dates
 *  and their own "Still here" (itemMarks.ts). Nothing in the header is
 *  ever dated. Null where there's nothing to ask about: no broad "is all of
 *  this right" instead. */
export type ConfirmPlace = { at: 'card'; subject: string } | { at: 'join' } | { at: 'sections' }

export function confirmPlace(item: DirectoryResource, category: CategoryConfig): ConfirmPlace | null {
  const main = mainThing(item, category)
  if (main === 'section') return { at: 'card', subject: mainCardOf(category)!.label }
  if (main === 'davening') return { at: 'card', subject: 'Times' }
  // Each section's hours in its own box, on its own date (Oct 6): whoever
  // uses the women's mikvah knows its hours, not the keilim's.
  if (main === 'groups') return { at: 'sections' }
  // A group's Join, not a network's website: "did it open the group?" is
  // a question only a joining link can be asked.
  if (main === 'join') {
    const link = primaryLink(item, category)!
    return /join/i.test(link.field.linkLabel ?? link.field.label) ? { at: 'join' } : null
  }
  return null
}

function hasHours(v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== ''
  return hasAnyHours(v)
}

/** A place with no address has one link that is the point of it: a
 *  WhatsApp group's Join. The url field the admin put in the row. */
export function primaryLink(item: DirectoryResource, category: CategoryConfig): { field: CategoryField; href: string } | null {
  if (category.hasAddress !== false) return null
  const field = category.detailFields.find((f) => f.type === 'url' && f.showInHeader && String(item[f.key] ?? '').trim())
  return field ? { field, href: String(item[field.key]).trim() } : null
}

// ── Audience groups (a mikvah's women's, men's, keilim) ──────────────────────

export type AudienceGroup = {
  /** The yes/no field saying the place serves this audience. */
  key: string
  /** "Women’s": the field's filter label, as the row says it. */
  label: string
  /** The fields that belong to it and have something in them, in order. */
  fields: CategoryField[]
}

/** One group per audience the listing serves and has something to say
 *  about. An audience with nothing filled in (Keilim ticked, no hours or
 *  notes) is left to the facts line. */
export function audienceGroups(item: DirectoryResource, category: CategoryConfig): AudienceGroup[] {
  const fields = category.detailFields
  const audienceKeys = new Set(fields.map((f) => f.audienceKey).filter((k): k is string => !!k))
  return fields
    .filter((f) => audienceKeys.has(f.key) && !!item[f.key])
    .map((flag) => ({
      key: flag.key,
      label: flag.filterLabel ?? flag.label,
      fields: fields.filter((f) => f.audienceKey === flag.key && filled(f, item[f.key])),
    }))
    .filter((g) => g.fields.length > 0)
}

function filled(f: CategoryField, v: unknown): boolean {
  if (f.type === 'hours') return hasHours(v)
  return String(v ?? '').trim() !== ''
}

// ── Status now ───────────────────────────────────────────────────────────────

export type StatusPart = { text: string; tone: 'open' | 'caution' | 'plain' }

/** For a place with a section per audience: which are open now, each in its
 *  own words ("Men’s open now", "Keilim until 7 PM"). One that isn't open
 *  says nothing rather than guessing when it next is: a mikvah's hours
 *  come with notes (by appointment, Motzei Shabbos) the hours can't say. */
export function audienceStatus(item: DirectoryResource, category: CategoryConfig, now: Date | null): StatusPart[] {
  if (!now) return []
  const parts: StatusPart[] = []
  for (const g of audienceGroups(item, category)) {
    const hoursKey = g.fields.find((f) => f.type === 'hours')?.key
    if (!hoursKey) continue
    const { isOpen, closing } = getOpenStatus(item, [hoursKey], now)
    if (!isOpen) continue
    const until = closing && closing.closeLabel !== '11:59 PM' ? shortTime(closing.closeLabel) : null
    parts.push(
      parts.length === 0
        ? { text: `${g.label} open now`, tone: 'open' }
        : { text: until ? `${g.label} until ${until}` : `${g.label} open`, tone: 'plain' },
    )
  }
  return parts
}

// ── Hours, as a week ─────────────────────────────────────────────────────────

/** "7:00 PM" → "7 PM"; "6:30 PM" stays. */
export function shortTime(label: string): string {
  return label.replace(/:00(?= [AP]M$)/, '')
}

export type WeekLine = { label: string; text: string; isToday: boolean }

/** The week, short: days with the same hours run together ("Sun – Thu,
 *  11 AM – 8 PM"), today on a line of its own unless `keepRuns` (a
 *  mikvah's three weeks, one under another, read better whole). A day saved
 *  as closed says Closed; a day never filled in says so, which isn't the
 *  same thing. Null for hours that aren't structured. */
export function compactWeek(v: unknown, now: Date, { keepRuns = false }: { keepRuns?: boolean } = {}): WeekLine[] | null {
  if (!isStructuredHours(v)) return null
  const hours = v as Partial<Record<DayKey, DayHours>>
  const today = DAY_KEYS[now.getDay()]
  const text = (k: DayKey) => {
    if (!(k in hours)) return 'No hours listed'
    const d = hours[k]
    return d ? `${shortTime(fmt12(d.open))} – ${shortTime(fmt12(d.close))}` : 'Closed'
  }
  const lines: { days: DayKey[]; text: string }[] = []
  for (const k of DAY_KEYS) {
    const t = text(k)
    const last = lines[lines.length - 1]
    if (last && last.text === t && (keepRuns || (k !== today && !last.days.includes(today)))) last.days.push(k)
    else lines.push({ days: [k], text: t })
  }
  return lines.map(({ days, text: t }) => ({
    label:
      days.length === 1
        ? short(days[0])
        : days.length === 2
          ? `${short(days[0])}, ${short(days[1])}`
          : `${short(days[0])} – ${short(days[days.length - 1])}`,
    text: t,
    isToday: days.includes(today),
  }))
}

// ── Onward ───────────────────────────────────────────────────────────────────

/** The places in the same category nearest this one, with how far each is
 *  from it. A category with no addresses (WhatsApp groups) has no nearest:
 *  the others, alphabetically. */
export function nearbyListings(
  item: DirectoryResource,
  items: readonly DirectoryResource[],
  count = 3,
): { item: DirectoryResource; miles: number | null }[] {
  const others = items.filter((o) => o.id !== item.id)
  const from = item.geo
  if (!from) return [...others].sort((a, b) => a.name.localeCompare(b.name)).slice(0, count).map((o) => ({ item: o, miles: null }))
  return others
    .filter((o) => o.geo)
    .map((o) => ({ item: o, miles: haversineMiles(from, o.geo!) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count)
}

// ── Actions ──────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ActionSpec =
  | { kind: 'directions' }
  | { kind: 'call' }
  | { kind: 'location' }
  | { kind: 'link'; field: CategoryField; href: string }
  | { kind: 'email'; field: CategoryField; address: string }

/** The buttons under the name, in order: Directions, Call, each link, an
 *  email. Share always comes last, so four of these at most; the rest are
 *  returned as `extra`, for the details. A place's one Join link isn't a
 *  button here: it's the main thing. A place people stay at and measure
 *  from (a hospital: listingParts.setLocation) ends with Set as location,
 *  which takes the fourth place. */
export function listingActions(item: DirectoryResource, category: CategoryConfig): { buttons: ActionSpec[]; extra: ActionSpec[] } {
  const all: ActionSpec[] = []
  if (category.hasAddress !== false && item.address) all.push({ kind: 'directions' })
  if (category.hasPhone !== false && item.phone) all.push({ kind: 'call' })
  const primary = primaryLink(item, category)?.field.key
  // A link on the admin's main card is said there, not twice.
  const onCard = new Set(mainCardOf(category)?.fields.map((f) => f.key) ?? [])
  for (const f of category.detailFields) {
    if (f.audienceKey || f.key === primary || onCard.has(f.key)) continue
    const v = String(item[f.key] ?? '').trim()
    if (!v) continue
    if (f.type === 'url') all.push({ kind: 'link', field: f, href: v })
    else if (f.type === 'text' && EMAIL.test(v)) all.push({ kind: 'email', field: f, address: v })
  }
  if (parseListingParts(category.listingParts).setLocation && category.hasAddress !== false && item.geo) {
    return { buttons: [...all.slice(0, 3), { kind: 'location' }], extra: all.slice(3) }
  }
  return { buttons: all.slice(0, 4), extra: all.slice(4) }
}

// ── How sure ─────────────────────────────────────────────────────────────────

/** A confirmation stays a quiet date for this long, then asks "Still
 *  right?" (agreed Sep 30). */
export const ASK_AFTER_DAYS = 90

/** Whether a confirmation made at `iso` has gone long enough to ask again.
 *  False before the page knows the time (`now` null). */
export function isStale(iso: string, now: number | null): boolean {
  if (now === null) return false
  const at = Date.parse(iso)
  return Number.isFinite(at) && now - at >= ASK_AFTER_DAYS * 86_400_000
}

/** Whether the nightly Google sync keeps any of what the contact box shows
 *  (its phone, website, or hours when they're there), so the box can say
 *  when it was last updated from Google: one date for the box, not a list
 *  of which lines (Oct 6). The description says so in its own box. False
 *  for a listing Google doesn't keep (no place ID any more). */
export function googleKeepsBox(item: DirectoryResource, shown: { hours?: boolean } = {}): boolean {
  if (!item.placeId || !item.googleSyncedAt) return false
  const kept = item.googleFields ?? []
  return (
    (kept.includes('phone') && !!item.phone) ||
    (kept.includes('website') && !!String(item.website ?? '').trim()) ||
    (kept.includes('hours') && !!shown.hours)
  )
}

/** A website as people say it: "judahkosher.com", no scheme or "www.";
 *  null for something that isn't a web address. */
export function siteName(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** A link that's the place's website, not a menu or a form. */
export function isWebsite(field: CategoryField): boolean {
  return field.key === 'website' || /website/i.test(field.linkLabel ?? field.label)
}

/** A note's first sentence, and what's left after it: a mikvah section's
 *  box shows the first and folds the rest (Oct 6). The first line, when it
 *  ends before any full stop ("Friday: 4:30 AM – 1 hours before Candle
 *  Lighting" over a paragraph). */
export function firstSentence(text: string): { first: string; rest: string } {
  const t = text.trim()
  const line = t.split('\n')[0]
  const sentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(t)?.[0]
  const first = (sentence && sentence.length <= line.length ? sentence : line).trim()
  return { first, rest: t.slice(first.length).trim() }
}

/** When a section was last confirmed: its own date, or the listing's when
 *  that's later (an admin's approval, or a confirmation from before
 *  sections had their own, which spoke for all of them). A mikvah's
 *  women's, men's and keilim hours; a shul's weekday and Shabbos times. */
export function sectionConfirmedAt(item: DirectoryResource, key: string): string | undefined {
  const own = (item.sectionConfirmed as Record<string, string> | undefined)?.[key]
  const all = item.confirmedAt
  if (!own) return all
  if (!all) return own
  return Date.parse(own) >= Date.parse(all) ? own : all
}
