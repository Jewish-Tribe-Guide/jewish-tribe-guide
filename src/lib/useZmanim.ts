'use client'

import { useEffect, useState } from 'react'
import type { ZmanimData } from '@/types'
import { community } from '@/community.config'
import { useToday } from '@/lib/useNow'
import { zmanimPath } from '@/lib/zmanimRequest'

/** 'no-location' means no coords were passed at all — a distinct state from
 *  'error', since the fix is the visitor entering an address rather than a
 *  retry. */
export type ZmanimStatus = 'loading' | 'no-location' | 'error' | 'ready'

// Module-level, day+coords+tzid-scoped — the same dedup shape useZmanAnchors
// already uses for shul anchor times, applied here for the same reason: the
// home screen mounts both its mobile and desktop layouts at once (CSS
// toggles which one shows, not JS — see Landing's own doc), so two live
// instances of this hook — ZmanimStrip's desktop copy and the mobile
// equivalent — call it with the exact same community-default coordinates on
// every single page load. Confirmed live: one home-screen visit fired this
// exact request twice. Keyed on the RAW inputs, not rounded the way
// useZmanAnchors' geoKey is — this only ever coalesces calls that would have
// produced byte-identical results anyway, so a location change still gets
// its own key and its own fetch, same as before this existed.
//
// A failed fetch is deliberately NOT cached here (unlike a success) — a
// later, non-concurrent mount should get to retry rather than being stuck
// showing 'error' for the rest of the day. See the render-time read below
// for how a caller still finds out about a failure from the one shared
// attempt it was actually part of.
const cache = new Map<string, ZmanimData>()
const inFlight = new Map<string, Promise<ZmanimData | null>>()

function cacheKey(day: string, lat: number, lng: number, tzid: string): string {
  return `${day}|${lat}|${lng}|${tzid}`
}

/** Test-only escape hatch. A consumer that re-stubs `fetch` between tests
 *  against the same fixed coordinates and system day — DaveningTimesModal's
 *  suite calls this hook with `community.mapCenter` on a pinned date — would
 *  otherwise keep serving whichever test happened to populate the cache
 *  first, since the module-level cache has no way to know a new test (rather
 *  than a new mount) has started. */
export function __resetZmanimCacheForTests(): void {
  cache.clear()
  inFlight.clear()
}

async function loadOne(url: string): Promise<ZmanimData | null> {
  const res = await fetch(url)
  const json = (await res.json()) as { ok: boolean; data?: ZmanimData }
  return json.ok && json.data ? json.data : null
}

/** Fetches zmanim for the given coordinates. Shared by the full Zmanim &
 *  Shabbos page (ZmanimCard) and the desktop home screen's compact week strip
 *  (ZmanimStrip) so the two can't drift on how they call the API or which
 *  states they distinguish.
 *
 *  Cached module-level, but keyed on today's date + these exact coordinates —
 *  not cached "on nothing": a visitor who changes address gets a fresh key
 *  and a fresh fetch, and the cache effectively resets at midnight the same
 *  way useZmanAnchors' does (see that file's own doc on why the date has to
 *  be part of the key — a tab left open overnight must not go on presenting
 *  yesterday's sunset as today's). What this dedups is two callers asking
 *  for the identical spot on the identical day at once, not different
 *  locations or different days. */
export function useZmanim(coords?: { lat: number; lng: number } | null): {
  data: ZmanimData | null
  status: ZmanimStatus
} {
  // Bumped once the shared fetch this mount is waiting on resolves, so a
  // cache hit that landed via SOME OTHER caller's request is picked up on
  // the next render — the cache/inFlight maps themselves aren't state, so
  // nothing else would trigger a re-render here.
  const [, setVersion] = useState(0)
  // A failure is local, not module-level (see the maps' own doc on why) —
  // keyed so a stale failure from a previous day/location's key can never
  // leak into this render once `key` below has moved on from it.
  const [erroredKey, setErroredKey] = useState<string | null>(null)
  // Re-renders when the date rolls over. These are today's zmanim and this
  // week's candle lighting, fetched once per location — so without the date
  // in the key, a tab left open overnight goes on presenting yesterday's
  // sunset as today's.
  const day = useToday()
  const hasCoords = coords?.lat != null && coords?.lng != null
  const key = hasCoords ? cacheKey(day, coords.lat, coords.lng, community.timezone) : null

  useEffect(() => {
    if (!hasCoords || !key) return
    if (cache.has(key)) return
    let cancelled = false

    let promise = inFlight.get(key)
    if (!promise) {
      const url = zmanimPath(coords.lat, coords.lng, community.timezone)
      promise = loadOne(url).finally(() => inFlight.delete(key))
      inFlight.set(key, promise)
    }

    promise
      .then((result) => {
        if (cancelled) return
        if (result) {
          cache.set(key, result)
          setVersion((v) => v + 1)
        } else {
          setErroredKey(key)
        }
      })
      .catch(() => {
        if (!cancelled) setErroredKey(key)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasCoords])

  if (!hasCoords || !key) return { data: null, status: 'no-location' }
  const cached = cache.get(key)
  if (cached) return { data: cached, status: 'ready' }
  if (erroredKey === key) return { data: null, status: 'error' }
  return { data: null, status: 'loading' }
}
