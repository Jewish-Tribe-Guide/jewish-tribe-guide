import type { ActivityKind, ActivitySource } from './activity'

// ── What changed (step 7a) ───────────────────────────────────────────────────
// The activity log read back for visitors: the What changed page and Today's
// "This week" block. Decided Oct 2: only what changed in the guide, meaning
// places added, edited or taken out (each an approved submission, or Google's
// update through the queue) and items added by an approved edit. A visitor's
// taps (Still right, an item seen or reported gone) stay in the log for credit
// and are never shown here.

/** The log's kinds that are changes to the guide. */
export const CHANGE_KINDS: readonly ActivityKind[] = ['listing_added', 'listing_edited', 'listing_removed', 'item_added']

/** At most this many of Google's updates a day, so a sync can't fill a week. */
export const GOOGLE_PER_DAY = 2

/** How far back the page goes; the Today block shows the last 7 days. */
export const CHANGES_PAGE_DAYS = 30
export const THIS_WEEK_DAYS = 7

/** One row of the log, with the listing it's about (any status, so a removed
 *  place still has its name). */
export type ChangeLogRow = {
  id: number
  createdAt: string
  kind: ActivityKind
  source: ActivitySource
  item: string | null
  submissionId: string | null
  hidden: boolean
  listing: { id: string; name: string; category: string; status: string } | null
}

export type ChangeKind = 'added' | 'edited' | 'removed' | 'items' | 'google'

/** One change as shown: an approval and the items it added are one line. */
export type Change = {
  /** Stable: the log rows it's made of, joined. */
  id: string
  rowIds: number[]
  at: string
  kind: ChangeKind
  listing: { id: string; name: string; category: string }
  items: string[]
  hidden: boolean
}

/** The log rows as changes, newest first. One approval (an edit and the items
 *  it added share a submission) reads as one line. A change to a place no
 *  longer in the guide isn't shown, except its removal. Hidden ones only for
 *  the admin. Google's updates are capped per day in the community's time. */
export function whatChanged(rows: readonly ChangeLogRow[], timezone: string, opts: { includeHidden?: boolean } = {}): Change[] {
  const groups = new Map<string, ChangeLogRow[]>()
  for (const row of rows) {
    if (!CHANGE_KINDS.includes(row.kind) || !row.listing) continue
    if (row.listing.status !== 'approved' && row.kind !== 'listing_removed') continue
    const key = row.submissionId ? `s:${row.submissionId}` : `r:${row.id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const changes: Change[] = [...groups.values()].map((group) => {
    const kinds = new Set(group.map((r) => r.kind))
    const items = [...new Set(group.filter((r) => r.kind === 'item_added' && r.item).map((r) => r.item!.trim()))]
    const kind: ChangeKind = kinds.has('listing_added')
      ? 'added'
      : kinds.has('listing_removed')
        ? 'removed'
        : items.length > 0
          ? 'items'
          : group.some((r) => r.source === 'google')
            ? 'google'
            : 'edited'
    const newest = group.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
    const { id, name, category } = newest.listing!
    return {
      id: group.map((r) => r.id).sort((a, b) => a - b).join('-'),
      rowIds: group.map((r) => r.id),
      at: newest.createdAt,
      kind,
      listing: { id, name, category },
      items,
      hidden: group.every((r) => r.hidden),
    }
  })

  changes.sort((a, b) => (a.at === b.at ? b.rowIds[0] - a.rowIds[0] : a.at < b.at ? 1 : -1))

  // Google's cap, counting only what's shown.
  const googleOnDay = new Map<string, number>()
  return changes.filter((c) => {
    if (c.hidden) return !!opts.includeHidden
    if (c.kind !== 'google') return true
    const day = new Date(c.at).toLocaleDateString('en-CA', { timeZone: timezone })
    const n = (googleOnDay.get(day) ?? 0) + 1
    googleOnDay.set(day, n)
    return n <= GOOGLE_PER_DAY
  })
}

/** The changes in the last `days` days before `now`. */
export function changesWithin(changes: readonly Change[], now: number, days: number): Change[] {
  const since = now - days * 24 * 60 * 60 * 1000
  return changes.filter((c) => Date.parse(c.at) >= since && Date.parse(c.at) <= now)
}

/** Today's block: the last 7 days' count, and the newest three, one per
 *  place. Null when nothing changed in that time: no block at all. */
export function thisWeek(changes: readonly Change[], now: number): { total: number; shown: Change[] } | null {
  const week = changesWithin(changes, now, THIS_WEEK_DAYS)
  if (week.length === 0) return null
  const places = new Set<string>()
  const shown = week.filter((c) => !places.has(c.listing.id) && places.add(c.listing.id)).slice(0, 3)
  return { total: week.length, shown }
}

/** "Pretzel Buns", "Challah and Wine", "Challah, Wine and Chicken": as the
 *  store lists them. */
function joinItems(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** The line, around the place's name (which the page sets in bold):
 *  "New: Charlie was a sinner.", "Pretzel Buns added at ALDI",
 *  "Ben & Jerry’s updated", "ALDI updated from Google". */
export function changeSentence(change: Change): { before: string; name: string; after: string } {
  const name = change.listing.name
  switch (change.kind) {
    case 'added':
      return { before: 'New: ', name, after: '' }
    case 'removed':
      return { before: '', name, after: ' taken out of the guide' }
    case 'items':
      return { before: `${joinItems(change.items)} added at `, name, after: '' }
    case 'google':
      return { before: '', name, after: ' updated from Google' }
    default:
      return { before: '', name, after: ' updated' }
  }
}

/** The day heading a change goes under, in the community's time: "Today",
 *  "Yesterday", else "Wednesday, Sep 30". */
export function changeDay(at: string, now: number, timezone: string): string {
  const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: timezone })
  const day = dayOf(Date.parse(at))
  if (day === dayOf(now)) return 'Today'
  // Noon today less a day: the day before, across a clock change.
  const [y, m, d] = dayOf(now).split('-').map(Number)
  if (day === new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10)) return 'Yesterday'
  return new Date(Date.parse(at)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone })
}

/** "6 PM", "12:30 PM", in the community's time. */
export function changeTime(at: string, timezone: string): string {
  return new Date(Date.parse(at))
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })
    .replace(':00', '')
}
