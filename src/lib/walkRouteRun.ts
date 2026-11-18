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
  /** Where in the work this run starts (the day's number, nightly): what
   *  ran out of budget or failed tonight isn't first in line again
   *  tomorrow (inTurn). */
  turn?: number
}

/** The list from position `turn` round to the start: a different first
 *  piece each night, so ones that fail every night (a place
 *  OpenRouteService can't route to) can't take the whole budget night
 *  after night and leave the rest never worked out (Nov 18 review). */
export function inTurn<T>(items: readonly T[], turn = 0): T[] {
  if (!items.length) return []
  const at = ((Math.trunc(turn) % items.length) + items.length) % items.length
  return [...items.slice(at), ...items.slice(0, at)]
}

/** The day's number, for `turn`: one more each day. */
export const dayNumber = (now = Date.now()) => Math.floor(now / 86_400_000)

export type WalkRouteResult = { listings: number; asked: number; walks: number; failed: number; leftForTomorrow: number }

export async function workOutWalks(deps: WalkRouteDeps): Promise<WalkRouteResult> {
  const result: WalkRouteResult = { listings: 0, asked: 0, walks: 0, failed: 0, leftForTomorrow: 0 }
  const placesOf = new Map<string, Promise<DirectoryResource[]>>()
  const places = (id: string) => {
    if (!placesOf.has(id)) placesOf.set(id, deps.listings(id))
    return placesOf.get(id)!
  }

  // Every request the run could make, first: then asked from tonight's
  // place in the list (inTurn).
  const work: { origin: DirectoryResource; from: LatLng; chunk: [string, LatLng][] }[] = []
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
      const all = [...wanted.entries()]
      for (let start = 0; start < all.length; start += ORS_MATRIX_MAX - 1) work.push({ origin, from, chunk: all.slice(start, start + ORS_MATRIX_MAX - 1) })
    }
  }

  for (const { origin, from, chunk } of inTurn(work, deps.turn)) {
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
      // Tried again another night, from elsewhere in the line: nothing was
      // kept for these.
      console.error(`[walk-routes] ${origin.name} failed:`, err)
      result.failed += chunk.length
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
    // Inside the job's 60s: one request that never answered ran it into
    // Vercel's cutoff, with nothing kept (Nov 18 review).
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
