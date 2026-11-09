// Asks before the browser's Back or Forward leaves a screen with unsaved
// changes (useLeaveGuard in SaveBar.tsx registers the screen here).
//
// It has to hear the move before Next's router does: listeners on window
// run in the order they were added, capture or not, and once the router has
// it the screen is gone, changes and all. The router adds its listener in
// its own effect, which React runs after every effect beneath it, so one
// added in a component's effect only comes first on the page's first load,
// never after a click into the admin from elsewhere (the user, Nov 9: Back
// left without asking). This module adds its listener as it loads, before
// anything mounts; BackGuardFirst in the root layout loads it on every page.

export const LEAVE_QUESTION = 'Leave without saving? Your changes will be lost.'

type Guard = { here: string; stays?: (path: string) => boolean; at: number | null }

const guards = new Set<Guard>()
// Set while a move the admin agreed to is handed on to the router.
let handingOn = false

type NavigationLike = { currentEntry?: { index: number } | null }
const entryIndex = (): number | null => (globalThis as { navigation?: NavigationLike }).navigation?.currentEntry?.index ?? null

/** Guards the screen at this address until the returned function is called. */
export function guardHere(stays?: (path: string) => boolean): () => void {
  const guard: Guard = { here: window.location.pathname, stays, at: entryIndex() }
  guards.add(guard)
  return () => guards.delete(guard)
}

export function onPopState(e: PopStateEvent) {
  if (handingOn) return
  const path = window.location.pathname
  const now = entryIndex()
  let leaving: Guard | undefined
  for (const g of guards) {
    if (path === g.here || g.stays?.(path)) g.at = now
    else leaving ??= g
  }
  if (!leaving) return
  e.stopImmediatePropagation()
  if (window.confirm(LEAVE_QUESTION)) {
    handingOn = true
    try {
      window.dispatchEvent(new PopStateEvent('popstate', { state: e.state }))
    } finally {
      handingOn = false
    }
    return
  }
  // Stay: step back onto the screen, which never stopped showing. How far
  // it moved is known where the browser says which entry it's on (the
  // Navigation API); elsewhere it was most likely Back.
  const moved = now !== null && leaving.at !== null ? now - leaving.at : -1
  window.history.go(-moved || 1)
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState)
