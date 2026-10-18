// Its own module, with no imports, so e2e-cache/ can read the same number
// without loading next/server into the Playwright process.

/** How long a render already in flight at the save gets to finish before the
 *  route is invalidated again. Measured, not guessed: the in-flight window
 *  for /about locally is under 0.6s (no lost saves once the save lands 300ms
 *  after the regeneration starts); this leaves CI's shared, slower test
 *  project several times that. A render longer than this can still slip
 *  through — this narrows the race to almost nothing, it cannot close it from
 *  outside Next. */
export const IN_FLIGHT_RENDER_GRACE_MS = 5_000
