// A plain module-level flag, not a CustomEvent — see Landing.tsx's own
// `backReveal` doc for why. In short: while the mobile home screen is
// hidden behind a category page, Next keeps its component instance alive
// rather than tearing it down (confirmed live: its DOM node and React state
// both survive), but its effects DO get torn down while hidden — matching
// React's own <Activity> semantics — so a `document.addEventListener`
// registered inside one of Landing's own effects isn't there to catch an
// event dispatched at exactly the moment a category's back arrow is
// tapped, and the signal is lost. A plain variable has no such window: it
// just sits there until something reads it, however long that takes.
let pendingHomeReveal = false

/** Called by goHome() the moment a real mobile back-navigation begins —
 *  before Next has necessarily reactivated Landing's own effects yet. */
export function markHomeReveal(): void {
  pendingHomeReveal = true
}

/** Called by Landing's own effect every time it (re)establishes — on a
 *  true first mount, and again whenever Activity reactivates it after
 *  being hidden. One-shot: reading it also clears it, so an unrelated
 *  later effect re-run (e.g. a resize toggling `isMobile`) doesn't
 *  replay a reveal that already happened. */
export function consumeHomeReveal(): boolean {
  const v = pendingHomeReveal
  pendingHomeReveal = false
  return v
}
