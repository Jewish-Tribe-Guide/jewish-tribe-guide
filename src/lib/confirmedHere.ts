// ── What this browser confirmed ──────────────────────────────────────────────
// A Yes under a box goes to the server at once, but the listing on screen came
// with the page, before it. A box keeps the new date in its own state, so
// closing the listing and opening it again started over from the page's copy
// and asked "Still right?" again (the user, Oct 18). The page's copy catches up
// only when the page is next rendered on the server.
//
// So each confirmation made here is remembered here, for as long as the tab is
// open, and a box opened again starts from it. A later one from the server (a
// re-render after someone else confirmed) still wins.

type Entry = { value: string | undefined; recordedAt: string }

const confirmed = new Map<string, Entry>()

const keyOf = (resourceId: string, section?: string) => `${resourceId}:${section ?? ''}`

/** Remembers the date a confirm (or its undo) left a listing, or one of its
 *  boxes, with. Undefined: an undo back to no date at all. */
export function recordConfirmed(resourceId: string, section: string | undefined, value: string | undefined, now = new Date().toISOString()): void {
  confirmed.set(keyOf(resourceId, section), { value, recordedAt: now })
}

/** The date to show: what this browser last left it at, unless the page's
 *  own copy is newer than that (someone confirmed since). */
export function confirmedAtHere(resourceId: string, section: string | undefined, fromPage: string | undefined): string | undefined {
  const mine = confirmed.get(keyOf(resourceId, section))
  if (!mine) return fromPage
  return fromPage && fromPage > mine.recordedAt ? fromPage : mine.value
}

/** For tests. */
export function forgetConfirmed(): void {
  confirmed.clear()
}
