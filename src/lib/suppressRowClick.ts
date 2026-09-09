// Module-level (not React state) and deliberately global across every
// ListingActionsMenu / listing-row instance on the page, not scoped to one
// component pairing the way GenericListingCard's own suppressNextRowClickRef
// is. A tap that closes an open kebab menu is "spent" on that dismissal even
// when it lands on a DIFFERENT listing's row than the one whose menu was
// open (a directory grid can have many cards, each with its own
// ListingActionsMenu) — otherwise that same tap ALSO toggles the other
// listing's card open/closed in the same motion: dismiss one thing, and
// something entirely unrelated reacts too. GenericListingCard's own ref
// still handles the same-card case (a tap elsewhere on the SAME card that
// owns the open menu); this covers every OTHER row on the page as well.
//
// Safe as plain module state (not a ref/context) because it's only ever
// read within the same user gesture it was set in — set on the outside
// mousedown that closes a menu, consumed by the click's own row handler a
// moment later — never carried across renders or read during render itself.
let suppressed = false

export function markRowClickSuppressed() {
  suppressed = true
}

/** Returns true (and clears the flag) at most once per triggering mousedown. */
export function consumeSuppressedRowClick(): boolean {
  if (!suppressed) return false
  suppressed = false
  return true
}
