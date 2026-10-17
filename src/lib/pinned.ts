// Pure logic for saved places — a visitor's personal shortlist, saved to
// this browser only. Called "pinned" in code because it was Pin until Oct 14,
// when Save replaced it; the storage key keeps the old name so every pin
// became a save without a migration (like UpvoteButton's voter token: no accounts, no
// database). Kept separate from React so the storage shape and edge cases
// (corrupt JSON, a stale localStorage entry, the cap) are testable without a
// DOM. See pinnedContext.tsx for the provider that wraps this in state.

export type PinnedListing = {
  id: string
  /** The category id the listing lives in — lets a marker/row be resolved
   *  back to its directory entry without searching every category. */
  categoryId: string
}

const STORAGE_KEY = 'jpc:pinned-listings'

// A soft ceiling, not a hard product decision — this is a personal shortlist,
// not a saved-places system meant to hold hundreds of entries. Well past what
// anyone would realistically want to scroll through on the map's own "Pinned"
// filter. Pinning past it drops the oldest pin rather than refusing the tap,
// so the control never just sits there silently doing nothing.
const MAX_PINS = 200

function isPinnedListing(value: unknown): value is PinnedListing {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as PinnedListing).id === 'string' &&
    typeof (value as PinnedListing).categoryId === 'string'
  )
}

/** Parses a raw localStorage string into a valid pin list — pulled out of
 *  loadPinned so the corrupt/malformed-input handling (a hand-edited value,
 *  a future format change, plain garbage) is unit-testable without a DOM. */
export function parsePinned(raw: string | null): PinnedListing[] {
  try {
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPinnedListing)
  } catch {
    return []
  }
}

export function loadPinned(): PinnedListing[] {
  return parsePinned(localStorage.getItem(STORAGE_KEY))
}

export function savePinned(pins: PinnedListing[]): void {
  try {
    if (pins.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
  } catch {
    // Storage unavailable (private mode, quota) — persistence is best-effort,
    // same as everywhere else this app touches localStorage.
  }
}

export function isPinned(pins: PinnedListing[], id: string): boolean {
  return pins.some((p) => p.id === id)
}

/** Adds or removes `listing` from `pins`, returning a new array (never
 *  mutates). Pinning past MAX_PINS drops the oldest entry first — see the
 *  note on MAX_PINS above. */
export function togglePinned(pins: PinnedListing[], listing: PinnedListing): PinnedListing[] {
  if (isPinned(pins, listing.id)) return pins.filter((p) => p.id !== listing.id)
  const withRoom = pins.length >= MAX_PINS ? pins.slice(1) : pins
  return [...withRoom, listing]
}

/** Undo of a remove: puts `listing` back where it was, so You's order
 *  doesn't change under the visitor (no reordering, canvas board YouRemove).
 *  Already there (undone twice) changes nothing. */
export function restorePinned(pins: PinnedListing[], listing: PinnedListing, index: number): PinnedListing[] {
  if (isPinned(pins, listing.id)) return pins
  const at = Math.max(0, Math.min(index, pins.length))
  return [...pins.slice(0, at), listing, ...pins.slice(at)]
}
