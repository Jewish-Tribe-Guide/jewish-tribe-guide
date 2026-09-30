import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { fmt12, getOpenStatus, isStructuredHours, DAY_KEYS, dayLabel, type DayKey, type DayHours } from './hours'

const short = (k: DayKey) => dayLabel(k).slice(0, 3)
import { haversineMiles, roundMiles } from './geo'
import { rowBadgeFields } from './listingRow'
import { isMinyanim } from './davening'
import { parseWalkList } from './walkList'
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

/** The field that says what kind of place this is: the first select badge
 *  that isn't a caveat-carrying one (a hechsher) or the one an items count
 *  replaces on the row (a grocery's "Kosher Items", which is a deciding fact
 *  here, not a kind). Food's "Restaurant", a shul's "Orthodox (Ashkenazi)". */
export function kindField(category: CategoryConfig): CategoryField | null {
  const replaced = itemsField(category)?.countReplacesKey
  return category.detailFields.find((f) => isBadge(f) && f.type === 'select' && !f.caveat && f.key !== replaced) ?? null
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
 *  grocery's "Kosher Items". Every filterable badge but the kind. */
export function listingFacts(item: DirectoryResource, category: CategoryConfig): string[] {
  const kind = kindField(category)?.key
  return rowBadgeFields(category).flatMap((f) => {
    if (f.key === kind) return []
    if (f.type === 'boolean') return item[f.key] ? [f.filterLabel ?? f.label] : []
    return optionLabels(f, item[f.key])
  })
}

/** How far, for the kind line: from the visitor when they've set a location,
 *  otherwise from the community's centre, which the list says it measures
 *  from. Nothing for a place in the centre itself: "0.2 mi from central
 *  Philadelphia" is just noise. */
export function listingDistance(item: DirectoryResource, region: string): string | null {
  if (item.milesFromAddress != null) return `${roundMiles(item.milesFromAddress)} mi away`
  if (item.milesFromCenter != null && item.milesFromCenter >= 0.5) return `${roundMiles(item.milesFromCenter)} mi from central ${region}`
  return null
}

// ── The main thing ───────────────────────────────────────────────────────────

export type MainThing = 'davening' | 'items' | 'groups' | 'walk' | 'join' | 'hours'

/** What the listing is mostly for, by what it holds. First that applies:
 *  davening times; items; one section per audience (a mikvah's women's,
 *  men's and keilim); the shuls within a walk (a hotel); the one link of a
 *  place with no address (Join a WhatsApp group); the week's hours. */
export function mainThing(item: DirectoryResource, category: CategoryConfig): MainThing | null {
  const fields = category.detailFields
  const minyanim = fields.find((f) => f.type === 'minyanim')
  if (minyanim && isMinyanim(item[minyanim.key]) && (item[minyanim.key] as unknown[]).length > 0) return 'davening'
  const items = itemsField(category)
  if (items && selectValues(item[items.key]).length + selectValues(item[`${items.key}_sometimes`]).length > 0) return 'items'
  if (audienceGroups(item, category).length > 0) return 'groups'
  if (parseWalkList(category.walkList) && item.geo) return 'walk'
  if (primaryLink(item, category)) return 'join'
  if (fields.some((f) => f.type === 'hours' && !f.audienceKey && hasHours(item[f.key]))) return 'hours'
  return null
}

function hasHours(v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== ''
  return isStructuredHours(v) && Object.values(v).some((d) => d != null)
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
  | { kind: 'link'; field: CategoryField; href: string }
  | { kind: 'email'; field: CategoryField; address: string }

/** The buttons under the name, in order: Directions, Call, each link, an
 *  email. Share always comes last, so four of these at most; the rest are
 *  returned as `extra`, for the details. A place's one Join link isn't a
 *  button here: it's the main thing. */
export function listingActions(item: DirectoryResource, category: CategoryConfig): { buttons: ActionSpec[]; extra: ActionSpec[] } {
  const all: ActionSpec[] = []
  if (category.hasAddress !== false && item.address) all.push({ kind: 'directions' })
  if (category.hasPhone !== false && item.phone) all.push({ kind: 'call' })
  const primary = primaryLink(item, category)?.field.key
  for (const f of category.detailFields) {
    if (f.audienceKey || f.key === primary) continue
    const v = String(item[f.key] ?? '').trim()
    if (!v) continue
    if (f.type === 'url') all.push({ kind: 'link', field: f, href: v })
    else if (f.type === 'text' && EMAIL.test(v)) all.push({ kind: 'email', field: f, address: v })
  }
  return { buttons: all.slice(0, 4), extra: all.slice(4) }
}
