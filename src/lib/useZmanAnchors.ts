'use client'

import { useEffect, useState } from 'react'
import { useToday } from '@/lib/useNow'
import { community } from '@/community.config'
import type { ZmanimData } from '@/types'
import { applyOffsetMinutes } from '@/lib/zmanim'
import { roundZmanimCoord, zmanimBatchPath, zmanimPath } from '@/lib/zmanimRequest'
import { clampTimeText, type MinyanBounds, type ZmanAnchor } from '@/lib/davening'

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

function summarize(data: ZmanimData): AnchorTimes {
  const sunset = data.dailyZmanim.find((z) => z.label === 'Sunset')
  return {
    sunsetIso: sunset?.iso,
    candleLightingIso: data.shabbos.candleLighting?.iso,
    havdalahIso: data.shabbos.havdalah?.iso,
  }
}

type Pending = readonly [cacheKey: string, geo: Geo]

/** Loads every pending location. Several keys can round to the same spot (the
 *  cache key keeps three decimals, the route two), so they are grouped by the
 *  spot the route will actually answer for. One spot is one plain request; two
 *  or more go in a single batch request. Failures leave a key uncached —
 *  callers just won't get a calculated time for that spot. */
async function loadPending(pending: Pending[]): Promise<void> {
  const bySpot = new Map<string, { geo: Geo; cacheKeys: string[] }>()
  for (const [cacheKey, geo] of pending) {
    const spot = `${roundZmanimCoord(geo.lat)},${roundZmanimCoord(geo.lng)}`
    const entry = bySpot.get(spot)
    if (entry) entry.cacheKeys.push(cacheKey)
    else bySpot.set(spot, { geo, cacheKeys: [cacheKey] })
  }
  const store = (cacheKeys: string[], data: ZmanimData) => {
    const times = summarize(data)
    for (const k of cacheKeys) cache.set(k, times)
  }

  try {
    const spots = [...bySpot.values()]
    if (spots.length === 1) {
      const res = await fetch(zmanimPath(spots[0].geo.lat, spots[0].geo.lng))
      const json = (await res.json()) as { ok: boolean; data?: ZmanimData }
      if (json.ok && json.data) store(spots[0].cacheKeys, json.data)
      return
    }
    const res = await fetch(zmanimBatchPath(spots.map((s) => s.geo)))
    const json = (await res.json()) as {
      ok: boolean
      results?: Array<{ lat: number; lng: number; ok: boolean; data?: ZmanimData }>
    }
    if (!json.ok || !json.results) return
    for (const r of json.results) {
      const entry = bySpot.get(`${r.lat},${r.lng}`)
      if (entry && r.ok && r.data) store(entry.cacheKeys, r.data)
    }
  } catch {
    // Leave uncached.
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
    // Only what nobody else is already fetching goes into our own request;
    // for the rest we just wait on the promise that's already out there.
    const mine = pending.filter(([cacheKey]) => !inFlight.has(cacheKey))
    if (mine.length > 0) {
      const p = loadPending([...mine]).finally(() => {
        for (const [cacheKey] of mine) inFlight.delete(cacheKey)
      })
      for (const [cacheKey] of mine) inFlight.set(cacheKey, p)
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
 *  resolved (yet, or at all — e.g. the location's Hebcal fetch failed).
 *
 *  The row's bounds are applied last, so a shul that davens at candle
 *  lighting but never after 7:00pm shows 7:00 PM in midsummer rather than the
 *  8:04 PM it would otherwise compute. Clamping HERE rather than at each call
 *  site is what keeps every surface honest — the listing card, the modal and
 *  anything added later all get the real time without having to remember. */
export function resolveAnchorTime(
  row: { anchor?: ZmanAnchor; offsetMinutes?: number } & MinyanBounds,
  anchors: AnchorTimes | undefined,
): string | null {
  if (!row.anchor || !anchors) return null
  const iso =
    row.anchor === 'sunset' ? anchors.sunsetIso
    : row.anchor === 'candle_lighting' ? anchors.candleLightingIso
    : anchors.havdalahIso
  if (!iso) return null
  const computed = applyOffsetMinutes(iso, row.offsetMinutes ?? 0, community.timezone)
  return clampTimeText(computed, row)
}

/** Human-readable name for an anchor, for tooltip/disclaimer copy. */
export function anchorNoun(anchor: ZmanAnchor): string {
  return anchor === 'sunset' ? 'sunset' : anchor === 'candle_lighting' ? 'candle lighting' : 'havdalah'
}
