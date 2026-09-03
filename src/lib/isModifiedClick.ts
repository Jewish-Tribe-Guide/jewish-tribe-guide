import type { MouseEvent } from 'react'

/** True for a cmd/ctrl/shift/alt-click or a non-primary-button click (e.g.
 *  the middle mouse button) — the set of clicks a browser treats specially on
 *  a real `<a>` (open in new tab/window, or nothing at all for a right-click,
 *  which never reaches a click handler in the first place).
 *
 *  For a `<Link>` that needs to run its own logic on a plain click instead of
 *  just navigating via `href` (see SiteHeader's onGoHome, which also resets
 *  local search/scroll state) — call `e.preventDefault()` and run that logic
 *  only when this returns false; otherwise return early and let the browser's
 *  native behavior on the underlying `<a>` handle the click. A `<Link>` with
 *  no extra logic beyond navigating doesn't need this at all: its own href
 *  already does the right thing for every kind of click on its own. */
export function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}
