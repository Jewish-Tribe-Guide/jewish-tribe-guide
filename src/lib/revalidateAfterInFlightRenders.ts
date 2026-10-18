import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { IN_FLIGHT_RENDER_GRACE_MS } from './inFlightRenderGrace'

// ─────────────────────────────────────────────────────────────────────────────
// Invalidating a route a second time, once any render that was already
// running when the first invalidation landed has had time to finish.
//
// Why this exists: Next stamps a route's cached page entry with the time it
// was WRITTEN, not the time its render STARTED (incremental-cache's
// `set()` records `lastModified: Date.now()`; `use cache` entries, by
// contrast, record the generation's start time). An entry counts as stale
// only if a tag was invalidated after that stamp. So a background
// regeneration that started before an admin's save — reading the old data —
// and finished after the save's revalidateTag/revalidatePath is stored with
// a stamp newer than the invalidation, and is treated as fresh. The old copy
// is then served as a HIT for the route's whole cacheLife (days), with
// nothing failing anywhere.
//
// That is the e2e-cache /about failure (every poll HIT/old), reproduced on
// demand: make /about stale, request it once so a regeneration starts, save
// within a few hundred ms — 6 of 8 saves never appeared, against 0 of 5 with
// no regeneration in flight. Still unfixed upstream as of Next 16.4.2 /
// 16.5 canary. See AGENTS.md's "/about had a second problem underneath it".
//
// The second pass only needs to reach route-level page entries: `use cache`
// entries are stamped with their start time, so the first invalidation
// already caught any of those that were mid-generation.
//
// Two traps this has to step around, both silent:
//   • It must not repeat a tag (or path) the request already invalidated.
//     Next de-duplicates revalidations per request: after() callbacks only
//     execute revalidations whose tag+profile was not already pending
//     (revalidation-utils' diffRevalidationState), so a repeat is dropped
//     without a word. Hence the dynamic route PATTERN with 'page' here
//     (`/[community]/about` → `_N_T_/[community]/about/page`), a different
//     tag from the concrete `/philly/about` a caller passes to its own
//     revalidatePath — and one call covers every community's copy.
//   • It has to run after the response, without holding it: after().
//
// The delay itself is IN_FLIGHT_RENDER_GRACE_MS (its own module, so the
// e2e-cache test that proves this can wait on the same number).
// ─────────────────────────────────────────────────────────────────────────────

/** Call from a Route Handler (or Server Action) right after its own
 *  invalidation. `routePattern` is the route's dynamic pattern, e.g.
 *  `/[community]/about` — see the dedupe note above for why not a concrete
 *  path. */
export function revalidateRouteAfterInFlightRenders(routePattern: string): void {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_RENDER_GRACE_MS))
    revalidatePath(routePattern, 'page')
  })
}
