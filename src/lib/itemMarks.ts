import type { DirectoryResource, ResourceSubmission } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { dayInTimezone } from './activity'
import { isStale } from './listingView'
import { editSubmission } from './editSubmission'

// ── "Still here" and "Not anymore", an item at a time (agreed Oct 1) ────────
// A listing's items each carry their own date: when someone last saw it
// there (details.itemSeen, set by an approved edit that added it, or a
// visitor's "Still here"), and whether someone has said it's gone and an
// admin hasn't decided yet (details.itemGone). Any category with an item list
// (a `tags` field) works this way: a grocery's kosher items, and a menu's
// dishes when Food has one.
//
// A date never says more than someone saw: "seen today", not "in stock". An
// item nobody has answered for has no date, and nothing says it was never
// seen.

export type ItemMark = {
  /** The item as the listing stores it: "Challah". */
  name: string
  /** The detail key it's stored under: the field's, or `<key>_sometimes`. */
  key: string
  sometimes: boolean
  /** When someone last saw it there. */
  seenAt: string | null
  /** When someone said it's gone, while that waits on an admin. */
  goneAt: string | null
}

function dates(item: DirectoryResource, map: 'itemSeen' | 'itemGone', key: string): Record<string, string> {
  const all = item[map]
  if (!all || typeof all !== 'object') return {}
  const field = (all as Record<string, unknown>)[key]
  if (!field || typeof field !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [label, at] of Object.entries(field as Record<string, unknown>)) {
    if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(at)) out[label.toLowerCase()] = at
  }
  return out
}

/** A listing's items with their dates, the always-there ones first. */
export function itemMarks(item: DirectoryResource, field: CategoryField): ItemMark[] {
  const out: ItemMark[] = []
  for (const [key, sometimes] of [
    [field.key, false],
    [`${field.key}_sometimes`, true],
  ] as const) {
    const seen = dates(item, 'itemSeen', key)
    const gone = dates(item, 'itemGone', key)
    for (const name of selectValues(item[key])) {
      const lower = name.toLowerCase()
      out.push({ name, key, sometimes, seenAt: seen[lower] ?? null, goneAt: gone[lower] ?? null })
    }
  }
  return out
}

/** "today", "yesterday", "Sep 30", in the community's own days, with the
 *  year once it's most of a year ago. Before the page knows the time
 *  (`now` null), the date alone, so the server and browser agree. */
export function dayText(iso: string, now: number | null, timezone: string): string {
  if (now !== null) {
    const day = dayInTimezone(timezone, new Date(iso))
    if (day === dayInTimezone(timezone, new Date(now))) return 'today'
    if (day === dayInTimezone(timezone, new Date(now - 86_400_000))) return 'yesterday'
  }
  const d = new Date(iso)
  const old = now !== null && now - d.getTime() > 300 * 86_400_000
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(old ? { year: 'numeric' } : {}), timeZone: timezone })
}

/** What a row says beside an item: "seen today", amber once nobody has
 *  said so for 90 days (as the listing's other dates). Null with no date. */
export function seenLabel(mark: ItemMark, now: number | null, timezone: string): { text: string; old: boolean } | null {
  if (!mark.seenAt) return null
  return { text: `seen ${dayText(mark.seenAt, now, timezone)}`, old: isStale(mark.seenAt, now) }
}

/** "Kosher" from "Kosher items here": what the items are, said before an
 *  item's name in a question ("Kosher steak here today?"), since a store
 *  that isn't a kosher store sells the other kind too. Empty for a list
 *  named for nothing more ("Menu", "Items"). */
export function itemQualifier(field: CategoryField): string {
  const m = /^(.*?)\s*\bitems?\b/i.exec(field.label.trim())
  return m ? m[1].trim() : ''
}

/** An item asked about in a sentence: "kosher steak", "challah". Names
 *  that aren't plain words keep their capitals ("IKC Challah"). */
export function itemPhrase(field: CategoryField, name: string): string {
  const said = /^[A-Z][a-z]+(\s[A-Z]?[a-z]+)*$/.test(name) ? name.toLowerCase() : name
  const q = itemQualifier(field)
  return q ? `${q.toLowerCase()} ${said}` : said
}

/** Seen this recently, an item isn't asked about. */
export const ITEM_ASK_AFTER_DAYS = 7

/**
 * The item a listing's one question asks about (agreed Oct 1): one that's
 * only sometimes there first, then whichever has gone longest unseen (never
 * seen counts as longest). Not one seen in the last week, nor one already
 * reported gone and waiting on an admin. Null when there's nothing worth
 * asking.
 */
export function pickItemToAsk(marks: readonly ItemMark[], now: number): ItemMark | null {
  const askable = marks.filter((m) => !m.goneAt && (!m.seenAt || now - Date.parse(m.seenAt) >= ITEM_ASK_AFTER_DAYS * 86_400_000))
  const longestUnseen = (a: ItemMark, b: ItemMark) => (a.seenAt ? Date.parse(a.seenAt) : 0) - (b.seenAt ? Date.parse(b.seenAt) : 0)
  return [...askable].sort((a, b) => Number(b.sometimes) - Number(a.sometimes) || longestUnseen(a, b))[0] ?? null
}

/** The edit suggestion "Not anymore" files: the listing as it stands, with
 *  that one item taken off. Built on the server from the stored listing,
 *  never from what a browser sends, so the queue shows exactly that change. */
export function removalSubmission(category: CategoryConfig, item: DirectoryResource, key: string, name: string): ResourceSubmission {
  const lower = name.toLowerCase()
  const kept = selectValues(item[key]).filter((v) => v.toLowerCase() !== lower)
  return editSubmission(category, item, { [key]: kept })
}
