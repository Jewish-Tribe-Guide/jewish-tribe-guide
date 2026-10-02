import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { haversineMiles, MILES_PER_MINUTE, type LatLng } from './geo'

// ── Other categories' places within a walk ──────────────────────────────────
// On each hotel, every shul within a 30-minute walk, nearest first: someone
// choosing where to stay for Shabbos needs to know what they can walk to, and
// the hotel list can't say it. On each hospital, several lists: food, shuls,
// hotels and a mikvah (step 5, Oct 2). Each category chooses in the admin's
// category editor (CategoryConfig.walkList) which other categories to list,
// how far, and how to group each, or none:
//
//   SYNAGOGUES WITHIN A WALK
//   UNDER 20 MINUTES · 4
//     8 min   Society Hill Synagogue      Conservative · Society Hill
//   20 TO 30 MINUTES · 5
//     …
//
//   FOOD WITHIN A WALK                      (grouped by Store Type)
//   Nearest restaurant: 20th Street Pizza, 27 min.
//   RESTAURANT · 3
//     27 min  20th Street Pizza           Parve · IKC
//   BAKERY · 2
//     …
//
// Every place in the category, whatever its denomination: nothing is picked
// for the visitor. Times are rough, in a straight line (see
// MILES_PER_MINUTE), and the list says so.

export type WalkList = {
  categoryId: string
  maxMinutes: number
  /** One of that category's yes/no or pick-list fields to group the places
   *  by, in its option order ("Store Type": restaurants first). Unset means
   *  by distance. */
  groupBy?: string
}

/** How many lists one category can show. */
export const MAX_WALK_LISTS = 6

/** How far a list can reach, in minutes of walking: the editor's choices. */
export const WALK_LIST_MINUTES = [10, 15, 20, 30, 45] as const

/** Where a list over this far splits into nearer and further. */
const SPLIT_MINUTES = 20

/** Whether a stored value is a list this code knows. Anything else means no
 *  list, never an error. */
export function parseWalkList(raw: unknown): WalkList | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const w = raw as Record<string, unknown>
  if (typeof w.categoryId !== 'string' || !w.categoryId) return null
  if (!(WALK_LIST_MINUTES as readonly unknown[]).includes(w.maxMinutes)) return null
  return {
    categoryId: w.categoryId,
    maxMinutes: w.maxMinutes as number,
    ...(typeof w.groupBy === 'string' && w.groupBy ? { groupBy: w.groupBy } : {}),
  }
}

/** A category's lists, in order: the stored array, or the one list stored
 *  before there could be several (a hotel's shuls). One list per category,
 *  the first kept; what this code doesn't know is left out. */
export function parseWalkLists(raw: unknown): WalkList[] {
  const all = (Array.isArray(raw) ? raw : [raw]).map(parseWalkList).filter((w): w is WalkList => !!w)
  return all.filter((w, i) => all.findIndex((x) => x.categoryId === w.categoryId) === i).slice(0, MAX_WALK_LISTS)
}

/** The lists as one string, for the editor's draft: '' (none) or JSON. */
export function walkListKey(lists: readonly WalkList[]): string {
  return lists.length ? JSON.stringify(lists) : ''
}

export function walkListFromKey(key: string): WalkList[] {
  if (!key) return []
  try {
    return parseWalkLists(JSON.parse(key))
  } catch {
    return []
  }
}

/** The fields a list of `target`'s places can be grouped by: its yes/no
 *  and pick-list fields that show as badges, the ones its own list
 *  filters and groups by. */
export function walkGroupFields(target: CategoryConfig): CategoryField[] {
  return target.detailFields.filter(
    (f) => (f.type === 'select' || f.type === 'boolean') && (f.renderAs ?? (f.type === 'boolean' ? 'badge' : 'row')) === 'badge',
  )
}

/** The categories a list can show: the others whose places have an address. */
export function walkListTargets(categories: readonly CategoryConfig[], self: Pick<CategoryConfig, 'id'>): CategoryConfig[] {
  return categories.filter((c) => c.kind === 'listing' && c.hasAddress !== false && c.id !== self.id)
}

/** Rough minutes on foot, at least one. */
export function walkMinutes(from: LatLng, to: LatLng): number {
  return Math.max(1, Math.round(haversineMiles(from, to) / MILES_PER_MINUTE.walk))
}

export type WalkRow = { item: DirectoryResource; minutes: number; miles: number }
export type WalkGroup = { label: string; rows: WalkRow[] }

/** What a list's places don't say, for a group by a field. */
export const DOESNT_SAY = 'Doesn’t say'

/** Every place with an address, nearest first, name on a tie. */
function byWalk(from: LatLng, places: readonly DirectoryResource[]): WalkRow[] {
  return places
    .flatMap((item) => {
      if (!item.geo) return []
      const miles = haversineMiles(from, item.geo)
      return [{ item, miles, minutes: Math.max(1, Math.round(miles / MILES_PER_MINUTE.walk)) }]
    })
    .sort((a, b) => a.minutes - b.minutes || a.item.name.localeCompare(b.item.name))
}

/** The nearest place past the walk, for "None within 30 minutes. Nearest:
 *  …". Null when there's none with an address. */
export function nearestBeyond(from: LatLng, places: readonly DirectoryResource[], maxMinutes: number): WalkRow | null {
  return byWalk(from, places).find((r) => r.minutes > maxMinutes) ?? null
}

/** The places within `maxMinutes` of `from`, nearest first, as the list's
 *  groups: "Under 20 minutes" and "20 to 30 minutes" when it reaches past
 *  20, otherwise one "Up to 15 minutes". Grouped by a field instead, one
 *  group per option in the field's order (a yes/no's one: "Shabbat
 *  friendly"), then the places that don't say. Empty groups are left out,
 *  so no places gives no groups. */
export function walkGroups(from: LatLng, places: readonly DirectoryResource[], maxMinutes: number, field?: CategoryField | null): WalkGroup[] {
  const rows = byWalk(from, places).filter((r) => r.minutes <= maxMinutes)
  if (field) return fieldGroups(rows, field)
  const groups =
    maxMinutes > SPLIT_MINUTES
      ? [
          { label: `Under ${SPLIT_MINUTES} minutes`, rows: rows.filter((r) => r.minutes < SPLIT_MINUTES) },
          { label: `${SPLIT_MINUTES} to ${maxMinutes} minutes`, rows: rows.filter((r) => r.minutes >= SPLIT_MINUTES) },
        ]
      : [{ label: `Up to ${maxMinutes} minutes`, rows }]
  return groups.filter((g) => g.rows.length > 0)
}

function fieldGroups(rows: WalkRow[], field: CategoryField): WalkGroup[] {
  // A place with two values is in its first one's group.
  const valueOf = (item: DirectoryResource): string | null =>
    field.type === 'boolean' ? (item[field.key] === true ? 'true' : null) : (selectValues(item[field.key])[0] ?? null)
  const options = field.type === 'boolean' ? [{ value: 'true', label: field.filterLabel ?? field.label }] : (field.options ?? [])
  const known = new Set(options.map((o) => o.value))
  const groups = options.map((o) => ({ label: o.label, rows: rows.filter((r) => valueOf(r.item) === o.value) }))
  groups.push({ label: DOESNT_SAY, rows: rows.filter((r) => { const v = valueOf(r.item); return v === null || !known.has(v) }) })
  return groups.filter((g) => g.rows.length > 0)
}

/** The list's answer, for a list grouped by a pick-list: the nearest of its
 *  first kind ("Nearest restaurant: 20th Street Pizza, 27 min."), and the
 *  place nearer than it when there is one, of another kind ("Nearer:
 *  Insomnia Cookies, a bakery, 6 min."). The field's first option is what
 *  the admin put first: Food's Store Type leads with Restaurant. Null when
 *  nothing of that first kind is within the walk. */
export function walkAnswer(groups: readonly WalkGroup[], field: CategoryField | null | undefined): string | null {
  if (!field || field.type !== 'select') return null
  const first = field.options?.[0]
  const lead = first && groups.find((g) => g.label === first.label)?.rows[0]
  if (!first || !lead) return null
  let text = `Nearest ${first.label.toLowerCase()}: ${lead.item.name}, ${lead.minutes} min.`
  const nearer = groups
    .filter((g) => g.label !== first.label && g.label !== DOESNT_SAY)
    .map((g) => ({ label: g.label, row: g.rows[0] }))
    .filter((x) => x.row && x.row.minutes < lead.minutes)
    .sort((a, b) => a.row.minutes - b.row.minutes)[0]
  if (nearer) text += ` Nearer: ${nearer.row.item.name}, ${withArticle(nearer.label.toLowerCase())}, ${nearer.row.minutes} min.`
  return text
}

/** "a bakery", "an ice cream & treats" reads badly, so a plural-looking
 *  or "&" label goes without. */
function withArticle(label: string): string {
  if (/&|s$/.test(label)) return label
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`
}

/** "37 min" up to an hour's walk, then miles: "2.5 mi". */
export function walkDistanceText(row: Pick<WalkRow, 'minutes' | 'miles'>): string {
  if (row.minutes <= 60) return `${row.minutes} min`
  return `${row.miles < 10 ? Math.round(row.miles * 10) / 10 : Math.round(row.miles)} mi`
}
