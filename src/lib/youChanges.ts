import type { Change } from './whatChanged'

// The blue dot on You (Oct 13, canvas page "you", board YouWeekday): a saved
// place that changed since the visitor last opened You, with two words on
// what ("New hours"). The personal half of What changed, which is put down
// for now: from the same activity log, never anything else.

const SEEN_KEY = 'jpc:you-seen-at'

/** When this phone last opened You, or null the first time. */
export function loadSeenAt(): number | null {
  try {
    const n = Number(localStorage.getItem(SEEN_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function storeSeenAt(ms: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(ms))
  } catch {
    // Best-effort: without it, no dots, which is what a first visit shows.
  }
}

/** Two words on what changed: "New hours", "New items", "Updated". The
 *  first thing it changed says it. */
export function changeWords(change: Change): string {
  if (change.kind === 'items') return 'New items'
  const label = change.parts[0]?.label?.trim()
  if (!label) return 'Updated'
  return /^new\b/i.test(label) ? label : `New ${label.toLowerCase()}`
}

/** Each saved place that changed after `since`, with its words, from its
 *  newest change. Nothing at all the first time You is opened (`since`
 *  null): every place would have a dot, which says nothing. */
export function changedSince(changes: readonly Change[] | null, ids: ReadonlySet<string>, since: number | null): Map<string, string> {
  const out = new Map<string, string>()
  if (!changes || since === null) return out
  for (const c of changes) {
    if (!ids.has(c.listing.id) || out.has(c.listing.id) || c.kind === 'removed') continue
    if (Date.parse(c.at) > since) out.set(c.listing.id, changeWords(c))
  }
  return out
}
