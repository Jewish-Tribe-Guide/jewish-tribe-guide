import type { DirectoryResource } from '@/types'
import { selectValues, type CategoryConfig } from './categories'
import { businessClosure, hoursOpenNow } from './hours'
import { roundMiles } from './geo'

// ── A category page's list, in groups ────────────────────────────────────────
// Each category can split its list one way, chosen in the admin's category
// editor (CategoryConfig.groupBy), so any community sets its own without
// code:
//
//   open      Open now · 57, then Not open now · 16 (Food). "Not open now",
//             never "Closed": some places have no hours at all.
//   distance  Within 2 mi · 13, then Further · 8 (Grocery), measured the way
//             the rows' own distances are: from the visitor's location, or
//             from the community's centre when none is set.
//   a yes/no  Shabbat friendly · 3, then Doesn't say · 7 (Hotels). An unticked
//             box doesn't mean "no", so the second group never claims it.
//   a pick-list  One group per value (Synagogues by denomination), and these
//             start CLOSED: one equal line each, with its count and nearest
//             place, alphabetical with "Other" last, the same order as the
//             Filters sheet, whatever order the admin entered them in. Equal
//             lines in a fixed order so no group is put first or made
//             bigger than another.
//
// The list keeps its own order (sort, pins, closed businesses last) inside
// each group. Empty groups are left out. A search's results aren't grouped
// at all: they're one list, nearest or best first.

export type GroupBy = { kind: 'open' } | { kind: 'distance'; miles: number } | { kind: 'field'; key: string }

export type ListGroup<T> = {
  /** Stable across visits, for remembering which closed groups were opened. */
  id: string
  label: string
  items: T[]
  /** A closed group's second line: "Mekor Habracha · 0.2 mi". */
  nearest?: string
}

export type Grouping<T> = {
  /** Pick-list groups start closed, each one line until opened. */
  closed: boolean
  /** What the whole list is grouped by, for the heading above closed
   *  groups: "By denomination". */
  title?: string
  groups: ListGroup<T>[]
}

/** The ways a category can be grouped, for the admin's editor: only the ones
 *  its own fields make possible. */
export function groupByOptions(category: CategoryConfig): { value: GroupBy; label: string }[] {
  const out: { value: GroupBy; label: string }[] = []
  if (category.detailFields.some((f) => f.type === 'hours')) {
    out.push({ value: { kind: 'open' }, label: 'Open now, then not open now' })
  }
  if (category.hasAddress !== false) {
    out.push({ value: { kind: 'distance', miles: DEFAULT_GROUP_MILES }, label: `Within ${DEFAULT_GROUP_MILES} mi, then further` })
  }
  for (const f of category.detailFields) {
    if (f.type === 'boolean') {
      out.push({ value: { kind: 'field', key: f.key }, label: `${fieldLabel(f)}, then doesn't say` })
    } else if (f.type === 'select') {
      out.push({ value: { kind: 'field', key: f.key }, label: `${f.label} (one closed group each)` })
    }
  }
  return out
}

export const DEFAULT_GROUP_MILES = 2

/** A grouping as one string, for a <select>: '' (one list), 'open',
 *  'distance', or 'field:<key>'. */
export function groupByKey(g: GroupBy | null | undefined): string {
  if (!g) return ''
  return g.kind === 'field' ? `field:${g.key}` : g.kind
}

export function groupByFromKey(key: string): GroupBy | null {
  if (key === 'open') return { kind: 'open' }
  if (key === 'distance') return { kind: 'distance', miles: DEFAULT_GROUP_MILES }
  if (key.startsWith('field:') && key.length > 6) return { kind: 'field', key: key.slice(6) }
  return null
}

/** Whether a stored value is a grouping this code knows. Anything else (an
 *  old shape, a hand-edited row) means no groups, never an error. */
export function parseGroupBy(raw: unknown): GroupBy | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  if (g.kind === 'open') return { kind: 'open' }
  if (g.kind === 'distance') {
    const miles = typeof g.miles === 'number' && g.miles > 0 ? g.miles : DEFAULT_GROUP_MILES
    return { kind: 'distance', miles }
  }
  if (g.kind === 'field' && typeof g.key === 'string' && g.key) return { kind: 'field', key: g.key }
  return null
}

/** Splits an already filtered and sorted list into its category's groups.
 *  Null when the category isn't grouped, or its grouping no longer fits its
 *  fields (the field was deleted, hours were removed). */
export function groupListings<T extends DirectoryResource>(
  items: readonly T[],
  category: CategoryConfig,
  now: Date,
): Grouping<T> | null {
  const groupBy = parseGroupBy(category.groupBy)
  if (!groupBy) return null

  if (groupBy.kind === 'open') {
    const hours = category.detailFields.filter((f) => f.type === 'hours')
    if (hours.length === 0) return null
    const isOpen = (item: T) =>
      !businessClosure(item as unknown as Record<string, unknown>) && hours.some((f) => hoursOpenNow(item[f.key], now) === true)
    return {
      closed: false,
      groups: nonEmpty([
        { id: 'open', label: 'Open now', items: items.filter(isOpen) },
        { id: 'not-open', label: 'Not open now', items: items.filter((i) => !isOpen(i)) },
      ]),
    }
  }

  if (groupBy.kind === 'distance') {
    if (category.hasAddress === false) return null
    const within = (item: T) => {
      const m = milesOf(item)
      return m != null && m <= groupBy.miles
    }
    return {
      closed: false,
      groups: nonEmpty([
        { id: 'within', label: `Within ${groupBy.miles} mi`, items: items.filter(within) },
        { id: 'further', label: 'Further', items: items.filter((i) => !within(i)) },
      ]),
    }
  }

  const field = category.detailFields.find((f) => f.key === groupBy.key)
  if (field?.type === 'boolean') {
    return {
      closed: false,
      groups: nonEmpty([
        { id: 'yes', label: fieldLabel(field), items: items.filter((i) => i[field.key] === true) },
        { id: 'doesnt-say', label: 'Doesn’t say', items: items.filter((i) => i[field.key] !== true) },
      ]),
    }
  }
  if (field?.type === 'select') {
    const valuesOf = (item: T) => [...new Set(selectValues(item[field.key]).map((v) => v.trim()).filter(Boolean))]
    const values = orderForPicking([...new Set(items.flatMap(valuesOf))])
    const groups: ListGroup<T>[] = values.map((v) => {
      // A place listed under two values belongs in both.
      const inGroup = items.filter((i) => valuesOf(i).includes(v))
      return { id: `v:${v}`, label: v, items: inGroup, nearest: nearestOf(inGroup) }
    })
    const unset = items.filter((i) => valuesOf(i).length === 0)
    groups.push({ id: 'doesnt-say', label: 'Doesn’t say', items: unset, nearest: nearestOf(unset) })
    return { closed: true, title: `By ${field.label.toLowerCase()}`, groups: nonEmpty(groups) }
  }
  return null
}

/** A pick-list's values in the order the Filters sheet and the groups offer
 *  them: alphabetical, with "Other…" last, whatever order the admin entered
 *  them in. Stable, so people find a value in the same place every time,
 *  and plainly not a ranking of one over another. */
export function orderForPicking(values: readonly string[]): string[] {
  const isOther = (v: string) => /^other\b/i.test(v.trim())
  return [...values].sort((a, b) => Number(isOther(a)) - Number(isOther(b)) || a.localeCompare(b))
}

const nonEmpty = <T>(groups: ListGroup<T>[]) => groups.filter((g) => g.items.length > 0)

const fieldLabel = (f: { label: string; filterLabel?: string }) => f.filterLabel ?? f.label

// The same number the row shows: from the visitor's location, else from the
// community's centre.
const milesOf = (item: DirectoryResource) => item.milesFromAddress ?? item.milesFromCenter ?? null

/** "Mekor Habracha · 0.2 mi": the nearest place in a closed group, or the
 *  first one when none has a distance. */
function nearestOf(items: readonly DirectoryResource[]): string | undefined {
  if (items.length === 0) return undefined
  let best = items[0]
  for (const i of items) {
    const m = milesOf(i)
    const b = milesOf(best)
    if (m != null && (b == null || m < b)) best = i
  }
  const m = milesOf(best)
  return m != null ? `${best.name} · ${roundMiles(m)} mi` : best.name
}
