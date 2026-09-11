'use client'

// Distinguishes "this page just mounted because of a real navigation" (a
// clicked link, a shared URL pasted in, typing an address — the case a
// directory's own search/filter state SHOULD hydrate from the URL for,
// since that's what makes a filtered link shareable at all) from "this page
// just mounted because the visitor pressed browser back/forward" — the one
// case GenericDirectory wants to land on a blank slate instead of restoring
// whatever was filtered before, even though the URL itself still carries it
// (see GenericDirectory's own use of this for the fuller reasoning).
//
// Two genuinely different mechanisms produce a back/forward arrival, and
// this checks for both — confirmed live that a single one isn't enough:
//
//   1. A same-document SPA transition: Next's own router runs entirely
//      client-side, and the browser fires `popstate` for the actual
//      back/forward gesture (the buttons, a swipe, a keyboard shortcut, or
//      `history.back()/forward()/go()`) — never for a `pushState`-driven
//      navigation like a <Link> click or router.push, so it reliably tells
//      the two apart.
//   2. A genuine document reload: confirmed live in this repo's own testing
//      setup — `window.history.back()` triggered a full reload (a
//      `window`-level marker set beforehand did not survive it), not a
//      same-document transition. `popstate` never fires for this: it's a
//      brand new page load, so this module's own state (including any
//      listener) starts over from scratch, same as a hard refresh. The only
//      way a freshly-loaded document can tell it arrived via back/forward is
//      the Navigation Timing API's own `type` field, checked once at module
//      load — it reports `'back_forward'` for exactly this case regardless
//      of whether the browser actually re-fetched the page or restored it
//      from bfcache.
//
// Cleared on the next `pushState` call, not after a fixed delay. A delay
// was the first thing tried here and it doesn't work: how long "this same
// arrival" needs to stay true depends on how long the destination page
// takes to actually mount the component that reads it (GenericDirectory
// mounts only once its category/community data has loaded, which is a real
// network round trip with no fixed upper bound) — confirmed live, a 100ms
// window missed it on one run and a slower one needed almost 3 full
// seconds, which is far too long to safely leave this sitting at `true` on
// its own (a visitor could easily click somewhere else, genuinely
// unrelated, inside that window). `pushState` is what EVERY subsequent real
// forward navigation in this app goes through — a <Link> click, router.push
// for the item/form/hospital params elsewhere in this tree — so "the next
// one of those happened" is an exact, timing-free answer to "is this still
// the same arrival," with a generous timeout kept only as a backstop in
// case nothing ever reads or navigates again.
//
// Module-level, not React state, for all of it: this has to be captured
// BEFORE the destination page's own components run their first render (a
// lazy `useState` initializer is exactly early enough — see
// GenericDirectory's own use), and there's no single component that's
// guaranteed to already be mounted, with a listener already attached, at
// the moment a same-document popstate fires.
let arrivedViaBackForward = false
if (typeof window !== 'undefined') {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  if (entry?.type === 'back_forward') arrivedViaBackForward = true

  window.addEventListener('popstate', () => { arrivedViaBackForward = true })

  const originalPushState = window.history.pushState.bind(window.history)
  window.history.pushState = function patchedPushState(...args: Parameters<History['pushState']>) {
    arrivedViaBackForward = false
    return originalPushState(...args)
  }

  // Backstop only — see the doc above for why this isn't the primary
  // mechanism. Long enough that it should never fire before pushState does
  // in ordinary use; if it ever does, the flag simply reverts to "treat this
  // as a real navigation," the safe direction to fail in.
  window.addEventListener('popstate', () => {
    setTimeout(() => { arrivedViaBackForward = false }, 10_000)
  })
}

/** Read once per mount (typically via a lazy `useState` initializer, so it's
 *  captured on the very first render rather than a tick later) — see this
 *  module's own doc for why it's a plain read, not consumed/cleared by the
 *  read itself. */
export function didArriveViaBackForward(): boolean {
  return arrivedViaBackForward
}
