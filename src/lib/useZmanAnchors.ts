'use client'

import { useEffect, useState } from 'react'
import { useToday } from '@/lib/useNow'
import { community } from '@/community.config'
import type { ZmanimData } from '@/types'
import { applyOffsetMinutes } from '@/lib/zmanim'
import type { ZmanAnchor } from '@/lib/davening'

export type AnchorTimes = {
  sunsetIso?: string
  candleLightingIso?: string
  havdalahIso?: string
}

type Geo = { lat: number; lng: number }

// Module-level so every mount within the same page load shares one fetch per
// location instead of re-hitting /api/zmanim — zmanim for a given spot don't
// change within a day, and the route itself is already cached upstream.
//
// Within a DAY, note, which is why the cache key carries the date. It used to
// be geo alone, on the reasoning that they don't change "within a session" —
// but a session here is a phone in someone's pocket, and a tab opened on
// Thursday evening was still captioning Friday's mincha with Thursday's
// sunset, under the word "today". Keyed by date, midnight simply misses.
const cache = new Map<string, AnchorTimes>()
const inFlight = new Map<string, Promise<void>>()

function geoKey({ lat, lng }: Geo): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

/** The cache/in-flight key. Distinct from `geoKey`, which stays the public
 *  lookup key callers index the returned record with — they shouldn't have to
 *  know the cache is date-scoped. */
function dayScopedKey(day: string, key: string): string {
  return `${day}|${key}`
}

async function loadOne(cacheKey: string, geo: Geo): Promise<void> {
  try {
    const res = await fetch(`/api/zmanim?lat=${geo.lat}&lng=${geo.lng}`)
    const json = (await res.json()) as { ok: boolean; data?: ZmanimData }
    if (json.ok && json.data) {
      const sunset = json.data.dailyZmanim.find((z) => z.label === 'Sunset')
      cache.set(cacheKey, {
        sunsetIso: sunset?.iso,
        candleLightingIso: json.data.shabbos.candleLighting?.iso,
        havdalahIso: json.data.shabbos.havdalah?.iso,
      })
    }
  } catch {
    // Leave uncached — callers just won't get a calculated time for this spot.
  }
}

/**
 * Resolves today's sunset + this week's candle-lighting/havdalah for a set of
 * shul locations, so anchor-based minyanim ("20 min before sunset") can show
 * a calculated clock time alongside their rule text. Pass `null`/`undefined`
 * for shuls with no geo or no anchor-based minyanim — they're skipped.
 *
 * Returns a map keyed by the same rounded geo string `geoKey` produces, so
 * callers look up a shul's result via `geoKey(shul.geo)`.
 */
export function useZmanAnchors(coords: Array<Geo | null | undefined>): Record<string, AnchorTimes> {
  const [, setVersion] = useState(0)
  // Re-runs the effect when the date rolls over, which misses the whole cache
  // for the new day and refetches. useToday rather than useNow so this is a
  // once-a-day change, not a once-a-minute one.
  const day = useToday()

  const keyed = coords.filter((c): c is Geo => !!c).map((c) => [geoKey(c), c] as const)
  const depKey = keyed.map(([k]) => k).sort().join('|')

  useEffect(() => {
    // Anything not yet cached needs this component to wait for it — even if
    // another mount (e.g. the listing card and the modal, sharing a geo)
    // already kicked off the fetch. Only skipping entirely when every key is
    // already cached; otherwise still await whichever promise is in flight
    // (starting a fresh one only when nobody else has), or this component
    // would never re-render once that shared fetch resolves.
    const pending = keyed
      .map(([key, geo]) => [dayScopedKey(day, key), geo] as const)
      .filter(([cacheKey]) => !cache.has(cacheKey))
    if (pending.length === 0) return
    let cancelled = false
    for (const [cacheKey, geo] of pending) {
      if (!inFlight.has(cacheKey)) {
        const p = loadOne(cacheKey, geo).finally(() => inFlight.delete(cacheKey))
        inFlight.set(cacheKey, p)
      }
    }
    Promise.all(pending.map(([cacheKey]) => inFlight.get(cacheKey) ?? Promise.resolve())).then(() => {
      if (!cancelled) setVersion((v) => v + 1)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, day])

  const result: Record<string, AnchorTimes> = {}
  for (const [key] of keyed) {
    const hit = cache.get(dayScopedKey(day, key))
    if (hit) result[key] = hit
  }
  return result
}

export { geoKey }

/** Falls back to the community's default location when a shul has no geo of
 *  its own, so a calculated time is still shown for a same-city app. */
export function geoOrCommunityDefault(geo: Geo | null | undefined): Geo {
  return geo ?? community.mapCenter
}

/** Resolves a minyan's calculated clock time from its anchor + offset against
 *  a location's resolved AnchorTimes, or `null` when there's nothing to
 *  calculate (clock-time row) or the zmanim for that location haven't
 *  resolved (yet, or at all — e.g. the location's Hebcal fetch failed). */
export function resolveAnchorTime(
  row: { anchor?: ZmanAnchor; offsetMinutes?: number },
  anchors: AnchorTimes | undefined,
): string | null {
  if (!row.anchor || !anchors) return null
  const iso =
    row.anchor === 'sunset' ? anchors.sunsetIso
    : row.anchor === 'candle_lighting' ? anchors.candleLightingIso
    : anchors.havdalahIso
  if (!iso) return null
  return applyOffsetMinutes(iso, row.offsetMinutes ?? 0, community.timezone)
}

/** Human-readable name for an anchor, for tooltip/disclaimer copy. */
export function anchorNoun(anchor: ZmanAnchor): string {
  return anchor === 'sunset' ? 'sunset' : anchor === 'candle_lighting' ? 'candle lighting' : 'havdalah'
}
