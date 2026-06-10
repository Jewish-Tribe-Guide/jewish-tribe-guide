// Travel-time helpers that call Google's Distance Matrix API. Server-only —
// requires a non-referrer-restricted key (GOOGLE_MAPS_SERVER_KEY). Callers
// should treat null / missing results as "unknown", not as errors — travel
// times are a nice-to-have sort/display enhancement.

import { hospitals } from '@/data/hospitals'
import type { LatLng } from './geo'
import type { TravelMap, TravelTimes } from '@/types'

type Mode = 'driving' | 'walking'

export async function computeTravelTimes(origin: LatLng): Promise<TravelMap | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) return null

  const originParam = `${origin.lat},${origin.lng}`
  const destinationsParam = hospitals.map((h) => `${h.latitude},${h.longitude}`).join('|')

  const [driving, walking] = await Promise.all([
    fetchDurationsMinutes(originParam, destinationsParam, 'driving', key),
    fetchDurationsMinutes(originParam, destinationsParam, 'walking', key),
  ])
  if (!driving && !walking) return null

  const map: TravelMap = {}
  hospitals.forEach((h, i) => {
    const times: TravelTimes = {}
    if (driving?.[i] != null) times.drive = driving[i] as number
    if (walking?.[i] != null) times.walk = walking[i] as number
    if (times.drive != null || times.walk != null) map[h.id] = times
  })
  return Object.keys(map).length > 0 ? map : null
}

// ── Arbitrary origin → multiple destinations ─────────────────────────────────
// Used for the community tab: compute drive/walk minutes from the user's typed
// address to each listing that has geo coordinates. Destinations are chunked to
// ≤ 25 per request (Google Distance Matrix limit with a single origin).
export async function computeTravelTimesFrom(
  origin: LatLng,
  destinations: { id: string; lat: number; lng: number }[],
): Promise<Record<string, { drive?: number; walk?: number }>> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key || destinations.length === 0) return {}

  const originParam = `${origin.lat},${origin.lng}`
  const results: Record<string, { drive?: number; walk?: number }> = {}
  const CHUNK = 25

  for (let i = 0; i < destinations.length; i += CHUNK) {
    const chunk = destinations.slice(i, i + CHUNK)
    const destParam = chunk.map((d) => `${d.lat},${d.lng}`).join('|')
    const [driving, walking] = await Promise.all([
      fetchDurationsMinutes(originParam, destParam, 'driving', key),
      fetchDurationsMinutes(originParam, destParam, 'walking', key),
    ])
    chunk.forEach((dest, j) => {
      const times: { drive?: number; walk?: number } = {}
      if (driving?.[j] != null) times.drive = driving[j] as number
      if (walking?.[j] != null) times.walk = walking[j] as number
      if (times.drive != null || times.walk != null) results[dest.id] = times
    })
  }

  return results
}

// ── Returns one duration (minutes, rounded) per destination ──────────────────
// in the same order as `destinations`, or null for a destination Google
// couldn't route. Returns null for the whole batch on a request-level failure.
async function fetchDurationsMinutes(
  origin: string,
  destinations: string,
  mode: Mode,
  key: string,
): Promise<(number | null)[] | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destinations)}` +
      `&mode=${mode}&units=imperial&key=${key}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      status: string
      rows: { elements: { status: string; duration?: { value: number } }[] }[]
    }
    if (data.status !== 'OK' || !data.rows[0]) return null
    return data.rows[0].elements.map((el) =>
      el.status === 'OK' && el.duration ? Math.round(el.duration.value / 60) : null,
    )
  } catch {
    return null
  }
}
