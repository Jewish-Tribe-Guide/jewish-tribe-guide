import { listCommunities } from './communityStore'
import { listCategoriesUncached } from './categoryStore'
import { approvedListingsNow, saveWalkRoutes, walkRoutesOf } from './walkRouteStore'
import { askOpenRouteService, workOutWalks, type WalkRouteResult } from './walkRouteRun'

// ── Working out the walks: nightly, and as soon as a listing changes ───────
// The nightly job (cron/walk-routes) and an admin's approval, new listing
// or restore (after() in those routes) run the same thing: the walks in
// reach that aren't kept yet, or whose ends moved. Right after a change
// that's the new or moved listing's walks alone, so it's seen with its
// walk along the streets at once, rather than an estimate until night (the
// user, Oct 15: "run that job now"). What a run can't reach in its budget,
// the night's run does.
//
// Listings are read straight from the table, not the cached read the site
// uses: right after an approval, that serves the list from before it while
// it refreshes.

export type WalkRouteRun =
  | { ok: true; skipped: string }
  | { ok: true; results: Record<string, WalkRouteResult> }

export async function runWalkRoutes({ communities, budget }: { communities?: readonly string[]; budget: number }): Promise<WalkRouteRun> {
  const key = process.env.OPENROUTESERVICE_API_KEY
  if (!key) return { ok: true, skipped: 'OPENROUTESERVICE_API_KEY is not set' }

  const slugs = communities ?? (await listCommunities()).map((c) => c.slug)
  let left = budget
  const results: Record<string, WalkRouteResult> = {}
  for (const slug of slugs) {
    const { routes, available } = await walkRoutesOf(slug)
    if (!available) return { ok: true, skipped: 'migration 080 (walk_route) has not been run' }
    const result = await workOutWalks({
      categories: await listCategoriesUncached(slug),
      listings: (category) => approvedListingsNow(slug, category),
      stored: routes,
      save: (fromId, walks) => saveWalkRoutes(slug, fromId, walks),
      ask: (body) => askOpenRouteService(key, body),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      budget: left,
    })
    left -= result.asked
    results[slug] = result
  }
  return { ok: true, results }
}

/** For after() in an admin route: never fails the save it follows. */
export function runWalkRoutesAfterChange(community: string): Promise<void> {
  return runWalkRoutes({ communities: [community], budget: 20 }).then(
    () => undefined,
    (err) => console.error('[walk-routes] after a change failed:', err),
  )
}
