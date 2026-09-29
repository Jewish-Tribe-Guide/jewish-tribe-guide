import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from './categories'
import { haversineMiles, MILES_PER_MINUTE, type LatLng } from './geo'

// ── Another category's places within a walk ─────────────────────────────────
// On each hotel, every shul within a 30-minute walk, nearest first: someone
// choosing where to stay for Shabbos needs to know what they can walk to, and
// the hotel list can't say it. Each category chooses in the admin's category
// editor (CategoryConfig.walkList) which other category to list and how far,
// or none:
//
//   SYNAGOGUES WITHIN A WALK
//   UNDER 20 MINUTES · 4
//     8 min   Society Hill Synagogue      Conservative · Society Hill
//   20 TO 30 MINUTES · 5
//     …
//
// Every place in the category, whatever its denomination: nothing is picked
// for the visitor. Times are rough, in a straight line (see
// MILES_PER_MINUTE), and the list says so.

export type WalkList = { categoryId: string; maxMinutes: number }

/** How far a list can reach, in minutes of walking: the editor's choices. */
export const WALK_LIST_MINUTES = [10, 15, 20, 30, 45] as const

/** Where a list over this far splits into nearer and further. */
const SPLIT_MINUTES = 20

/** Whether a stored value is a list this code knows. Anything else means no
 *  list, never an error. */
export function parseWalkList(raw: unknown): WalkList | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  if (typeof w.categoryId !== 'string' || !w.categoryId) return null
  if (!(WALK_LIST_MINUTES as readonly unknown[]).includes(w.maxMinutes)) return null
  return { categoryId: w.categoryId, maxMinutes: w.maxMinutes as number }
}

/** A list as one string, for the editor: '' (none) or '<category>:<minutes>'. */
export function walkListKey(w: WalkList | null | undefined): string {
  return w ? `${w.categoryId}:${w.maxMinutes}` : ''
}

export function walkListFromKey(key: string): WalkList | null {
  const at = key.lastIndexOf(':')
  if (at <= 0) return null
  return parseWalkList({ categoryId: key.slice(0, at), maxMinutes: Number(key.slice(at + 1)) })
}

/** The categories a list can show: the others whose places have an address. */
export function walkListTargets(categories: readonly CategoryConfig[], self: Pick<CategoryConfig, 'id'>): CategoryConfig[] {
  return categories.filter((c) => c.kind === 'listing' && c.hasAddress !== false && c.id !== self.id)
}

/** Rough minutes on foot, at least one. */
export function walkMinutes(from: LatLng, to: LatLng): number {
  return Math.max(1, Math.round(haversineMiles(from, to) / MILES_PER_MINUTE.walk))
}

export type WalkRow = { item: DirectoryResource; minutes: number }
export type WalkGroup = { label: string; rows: WalkRow[] }

/** The places within `maxMinutes` of `from`, nearest first, as the list's
 *  groups: "Under 20 minutes" and "20 to 30 minutes" when it reaches past
 *  20, otherwise one "Up to 15 minutes". Empty groups are left out, so no
 *  places gives no groups. */
export function walkGroups(from: LatLng, places: readonly DirectoryResource[], maxMinutes: number): WalkGroup[] {
  const rows = places
    .flatMap((item) => (item.geo ? [{ item, minutes: walkMinutes(from, item.geo) }] : []))
    .filter((r) => r.minutes <= maxMinutes)
    .sort((a, b) => a.minutes - b.minutes || a.item.name.localeCompare(b.item.name))
  const groups =
    maxMinutes > SPLIT_MINUTES
      ? [
          { label: `Under ${SPLIT_MINUTES} minutes`, rows: rows.filter((r) => r.minutes < SPLIT_MINUTES) },
          { label: `${SPLIT_MINUTES} to ${maxMinutes} minutes`, rows: rows.filter((r) => r.minutes >= SPLIT_MINUTES) },
        ]
      : [{ label: `Up to ${maxMinutes} minutes`, rows }]
  return groups.filter((g) => g.rows.length > 0)
}
