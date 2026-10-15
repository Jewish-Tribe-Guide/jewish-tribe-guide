import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from './categories'
import type { LatLng } from './geo'
import { parseWalkLists } from './walkList'
import { ORS_MATRIX_MAX, orsMatrixBody, readOrsMatrix, routesToWorkOut, type WalkRoute } from './walkRoutes'

// ── The nightly job's work, for one community (cron/walk-routes) ────────────
// For each listing whose category lists places "Within a walk", the walks
// to those places that are in reach and not worked out yet (or with an end
// moved), asked of OpenRouteService one listing at a time, and kept. The
// first run works out everything; after that, a night with no new or moved
// listing asks nothing.
//
// OpenRouteService's free plan allows 500 matrix requests a day and 40 a
// minute: one request a listing, spaced out, and at most `budget` a run.

export const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/foot-walking'

/** One request every 1.6 seconds: under 40 a minute. */
export const ORS_SPACING_MS = 1600

export type WalkRouteDeps = {
  categories: readonly CategoryConfig[]
  /** The approved listings of one category. */
  listings: (categoryId: string) => Promise<DirectoryResource[]>
  stored: ReadonlyMap<string, ReadonlyMap<string, WalkRoute>>
  save: (fromId: string, walks: ({ toId: string } & WalkRoute)[]) => Promise<void>
  /** Posts a matrix request: OpenRouteService's reply body, or throws. */
  ask: (body: ReturnType<typeof orsMatrixBody>) => Promise<unknown>
  wait: (ms: number) => Promise<void>
  /** Requests this run may still make. */
  budget: number
}

export type WalkRouteResult = { listings: number; asked: number; walks: number; failed: number; leftForTomorrow: number }

export async function workOutWalks(deps: WalkRouteDeps): Promise<WalkRouteResult> {
  const result: WalkRouteResult = { listings: 0, asked: 0, walks: 0, failed: 0, leftForTomorrow: 0 }
  const placesOf = new Map<string, Promise<DirectoryResource[]>>()
  const places = (id: string) => {
    if (!placesOf.has(id)) placesOf.set(id, deps.listings(id))
    return placesOf.get(id)!
  }

  for (const category of deps.categories) {
    const lists = parseWalkLists(category.walkList).filter((w) => deps.categories.some((c) => c.id === w.categoryId))
    if (lists.length === 0) continue
    for (const origin of await places(category.id)) {
      if (!origin.geo) continue
      result.listings++
      const from = origin.geo
      // Its lists' places in reach, each once (a place can be in two lists).
      const wanted = new Map<string, LatLng>()
      for (const list of lists) {
        const targets = (await places(list.categoryId)).filter((p) => p.id !== origin.id)
        for (const t of routesToWorkOut(from, targets, list.maxMinutes, deps.stored.get(origin.id))) wanted.set(t.id, t.geo)
      }
      if (wanted.size === 0) continue
      const all = [...wanted.entries()]
      for (let start = 0; start < all.length; start += ORS_MATRIX_MAX - 1) {
        const chunk = all.slice(start, start + ORS_MATRIX_MAX - 1)
        if (result.asked >= deps.budget) {
          result.leftForTomorrow += chunk.length
          continue
        }
        if (result.asked > 0) await deps.wait(ORS_SPACING_MS)
        result.asked++
        try {
          const walks = readOrsMatrix(await deps.ask(orsMatrixBody(from, chunk.map(([, geo]) => geo))), chunk.length)
          if (!walks) throw new Error('Not a matrix reply')
          await deps.save(
            origin.id,
            chunk.map(([toId, to], i) => ({ toId, from, to, ...walks[i] })),
          )
          result.walks += chunk.length
        } catch (err) {
          // Tried again tomorrow: nothing was kept for these.
          console.error(`[walk-routes] ${origin.name} failed:`, err)
          result.failed += chunk.length
        }
      }
    }
  }
  return result
}

/** Asks OpenRouteService with the guide's key. */
export async function askOpenRouteService(key: string, body: ReturnType<typeof orsMatrixBody>): Promise<unknown> {
  const res = await fetch(ORS_MATRIX_URL, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
