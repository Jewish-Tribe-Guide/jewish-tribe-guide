import { haversineMiles, type LatLng } from './geo'

// ── Walking times along the streets (Oct 15) ─────────────────────────────────
// A hotel's shuls, a hospital's food and so on are listed "Within a walk"
// (walkList.ts). Their minutes were a straight line at 25 minutes a mile,
// which goes wrong across a river, a highway or a park: where the line goes
// and a walker can't. Now each walk is worked out once by OpenRouteService
// over OpenStreetMap (free, and its answers may be kept), stored
// (migration 080), and worked out again only when one end moves. A walk not
// worked out yet shows the estimate, as before.

/** One stored walk: where both ends were when it was worked out, and the
 *  walk itself (null minutes: no walking route was found). */
export type WalkRoute = { from: LatLng; to: LatLng; minutes: number | null; meters: number | null }

/** The walks that hold, by place id: minutes and miles. */
export type Routed = ReadonlyMap<string, { minutes: number; miles: number }>

type Place = { id: string; geo?: LatLng | null }

/** Further than this and an end has moved (a new address, a corrected
 *  pin): about 25 metres. */
const MOVED_MILES = 0.015

export function samePlace(a: LatLng, b: LatLng): boolean {
  return haversineMiles(a, b) < MOVED_MILES
}

const METERS_PER_MILE = 1609.344

/** The stored walks from `from` that still hold: neither end has moved
 *  since, and a route was found. */
export function routesThatHold(stored: Readonly<Record<string, WalkRoute>>, from: LatLng, places: readonly Place[]): Routed {
  const out = new Map<string, { minutes: number; miles: number }>()
  for (const p of places) {
    const r = stored[p.id]
    if (!r || !p.geo || r.minutes === null || r.meters === null) continue
    if (!samePlace(r.from, from) || !samePlace(r.to, p.geo)) continue
    out.set(p.id, { minutes: r.minutes, miles: r.meters / METERS_PER_MILE })
  }
  return out
}

/** The quickest any walk could be, in minutes a straight-line mile: 3 mph
 *  with no turns. A place further than its list reaches even at that is
 *  never in the list, so its walk isn't worth working out. */
const FASTEST_MINUTES_A_MILE = 20

/** Which of `places` need their walk from `from` worked out: in reach of
 *  `maxMinutes`, and never worked out, or with an end moved since. */
export function routesToWorkOut(
  from: LatLng,
  places: readonly Place[],
  maxMinutes: number,
  stored: ReadonlyMap<string, WalkRoute> | undefined,
): { id: string; geo: LatLng }[] {
  const out: { id: string; geo: LatLng }[] = []
  for (const p of places) {
    if (!p.geo || haversineMiles(from, p.geo) * FASTEST_MINUTES_A_MILE > maxMinutes) continue
    const r = stored?.get(p.id)
    if (r && samePlace(r.from, from) && samePlace(r.to, p.geo)) continue
    out.push({ id: p.id, geo: p.geo })
  }
  return out
}

/** OpenRouteService's matrix takes at most this many walks in one request
 *  (sources × destinations). */
export const ORS_MATRIX_MAX = 3500

/** The body of one matrix request: from one place to each of `to`. ORS
 *  takes [longitude, latitude]. */
export function orsMatrixBody(from: LatLng, to: readonly LatLng[]) {
  return {
    locations: [from, ...to].map((p) => [p.lng, p.lat]),
    sources: [0],
    destinations: to.map((_, i) => i + 1),
    metrics: ['duration', 'distance'],
    units: 'm',
  }
}

/** Each walk from a matrix reply, in the order asked: minutes (at least
 *  one) and metres, or nulls where ORS found no route. Null when the reply
 *  isn't one. */
export function readOrsMatrix(body: unknown, count: number): { minutes: number | null; meters: number | null }[] | null {
  const b = body as { durations?: unknown; distances?: unknown } | null
  const durations = Array.isArray(b?.durations) ? b.durations[0] : null
  const distances = Array.isArray(b?.distances) ? b.distances[0] : null
  if (!Array.isArray(durations) || !Array.isArray(distances) || durations.length !== count || distances.length !== count) return null
  return durations.map((seconds, i) => {
    const meters = distances[i]
    if (typeof seconds !== 'number' || typeof meters !== 'number') return { minutes: null, meters: null }
    return { minutes: Math.max(1, Math.round(seconds / 60)), meters: Math.round(meters) }
  })
}
