import type { DirectoryResource, ResourceSubmission } from '@/types'
import { selectValues, type CategoryConfig, type CategoryField } from './categories'
import { dayInTimezone } from './activity'
import { isStale } from './listingView'
import { editSubmission } from './editSubmission'
import { ITEM_NAMES, itemEntry, itemName } from './itemNames'

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

/** When someone last saw one item there, by its name as the listing has
 *  it, whichever list it's in. Null with no date. */
export function seenAtFor(item: DirectoryResource, name: string): string | null {
  const all = item.itemSeen
  if (!all || typeof all !== 'object') return null
  const lower = name.toLowerCase()
  for (const key of Object.keys(all as Record<string, unknown>)) {
    const at = dates(item, 'itemSeen', key)[lower]
    if (at) return at
  }
  return null
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

// ── Add an item (agreed Oct 1) ────────────────────────────────────────────────
// "+ Add an item" as the list's last row: a box with suggestions from the
// item names, then an edit suggestion adding it, which an admin checks
// before everyone sees it.

/** A name as typed, tidied, or null when it can't be an item: too short or
 *  long, or looking like an email, a link or a phone number (the box is
 *  public; the queue isn't a place for those). */
export function cleanItemName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60) return null
  if (/@|https?:|www\./i.test(name) || /(?:\d[\s().-]*){7,}/.test(name)) return null
  return name
}

/** The listed item this name already is, under any of its names ("Some
 *  Sliced Cheese" for "sliced cheese"), or null. */
export function alreadyListed(marks: readonly ItemMark[], name: string): ItemMark | null {
  const want = itemName(name).toLowerCase()
  return marks.find((m) => itemName(m.name).toLowerCase() === want) ?? null
}

export type ItemSuggestion = { name: string; listed: ItemMark | null }

/** What the box suggests for what's been typed: names on the item list
 *  whose words (or other names') start with it. The store's own items come
 *  first, so picking one it has is that item's "Still here", not a second
 *  copy; then names that start with it, then names with a word that does,
 *  then names only another of its names matches (Brie, as "Brie Cheese").
 *  A few at most. */
export function itemSuggestions(typed: string, marks: readonly ItemMark[], max = 4): ItemSuggestion[] {
  const t = typed.trim().toLowerCase()
  if (t.length < 2) return []
  const wordStarts = (text: string) => text.toLowerCase().startsWith(t) || text.toLowerCase().split(/\s+/).some((w) => w.startsWith(t))
  // Lower is better: 0 starts with it, 1 a word does, 2 only another name.
  const rank = (name: string, aka: readonly string[]) => (name.toLowerCase().startsWith(t) ? 0 : wordStarts(name) ? 1 : aka.some(wordStarts) ? 2 : -1)
  const found = new Map<string, ItemSuggestion & { rank: number; order: number }>()
  const consider = (name: string, aka: readonly string[], listed: ItemMark | null) => {
    const r = rank(name, aka)
    const k = itemName(name).toLowerCase()
    if (r < 0 || found.has(k)) return
    found.set(k, { name, listed, rank: listed ? -1 : r, order: found.size })
  }
  for (const m of marks) consider(m.name, itemEntry(m.name)?.aka ?? [], m)
  for (const e of ITEM_NAMES) consider(e.name, e.aka ?? [], alreadyListed(marks, e.name))
  return [...found.values()]
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, max)
    .map(({ name, listed }) => ({ name, listed }))
}

/** The name an added item goes in under: the list's name for it, or, for a
 *  name not on the list typed all in lower case ("rugelach"), with capitals
 *  as the guide's items have them ("Rugelach"). Anything else as typed. */
export function addedItemName(name: string): string {
  if (itemEntry(name)) return itemName(name)
  const n = name.trim()
  return n === n.toLowerCase() ? n.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase()) : n
}

/** The edit suggestion "Add an item" files: the listing as it stands with
 *  one item more, in its list's always or sometimes part. A name on the
 *  item list goes in under the list's name for it. */
export function additionSubmission(category: CategoryConfig, item: DirectoryResource, fieldKey: string, name: string, sometimes: boolean): ResourceSubmission {
  const key = sometimes ? `${fieldKey}_sometimes` : fieldKey
  return editSubmission(category, item, { [key]: [...selectValues(item[key]), addedItemName(name)] })
}
