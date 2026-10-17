'use client'

import { useEffect, useState } from 'react'
import type { Eruv } from './eruv'
import type { EruvLineFile } from './eruvLine'

// The eruvim and their statuses (/api/eruv), fetched once per community per
// page load and shared: a hospital listing's Shabbos box and the home's
// "Your eruv" ask for the same thing. Null until it arrives; `available`
// false without migration 074, or when it can't be fetched.

export type EruvStatuses = { available: false } | { available: true; timezone: string; candles: number | null; eruvim: Eruv[]; mapsVersion: string | null }

const cache = new Map<string, Promise<EruvStatuses>>()

export function fetchEruvStatuses(communitySlug: string): Promise<EruvStatuses> {
  let p = cache.get(communitySlug)
  if (!p) {
    p = fetch(`/api/eruv?community=${encodeURIComponent(communitySlug)}`)
      .then((r) => r.json())
      .then((b): EruvStatuses => (b?.ok && b.available ? { available: true, timezone: b.timezone, candles: b.candles ?? null, eruvim: b.eruvim, mapsVersion: b.mapsVersion ?? null } : { available: false }))
      .catch((): EruvStatuses => ({ available: false }))
    cache.set(communitySlug, p)
    // A failure isn't kept: the next page asks again.
    p.then((s) => !s.available && cache.delete(communitySlug))
  }
  return p
}

/** For tests. */
export function clearEruvStatuses(): void {
  cache.clear()
  mapsCache.clear()
}

export function useEruvStatuses(communitySlug: string, wanted = true): EruvStatuses | null {
  const [data, setData] = useState<EruvStatuses | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    fetchEruvStatuses(communitySlug).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [communitySlug, wanted])
  return data
}

/** How many eruvim the community has, for the Eruv card's count; null
 *  until known, and without an Eruv page (`wanted` false) or the list. */
export function useEruvCount(communitySlug: string, wanted: boolean): number | null {
  const statuses = useEruvStatuses(communitySlug, wanted)
  return statuses?.available ? statuses.eruvim.length : null
}

// ── Their maps (/api/eruv/maps, Oct 12) ─────────────────────────────────────
// Each eruv's own map, as the eruv draws it, for the maps that show them:
// the Eruv page and the Map tab's Eruvim layer. Fetched only when one of
// them is there, and shared. Empty without any (or without migration 076).
// Asked for under the version /api/eruv gives (eruvMapsVersion), so an
// admin's change isn't behind the CDN's hour.

export type EruvMaps = Map<string, EruvLineFile>

const mapsCache = new Map<string, Promise<EruvMaps>>()

export function fetchEruvMaps(communitySlug: string, version: string | null = null): Promise<EruvMaps> {
  const key = `${communitySlug}|${version ?? ''}`
  let p = mapsCache.get(key)
  if (!p) {
    p = fetch(`/api/eruv/maps?community=${encodeURIComponent(communitySlug)}${version ? `&v=${encodeURIComponent(version)}` : ''}`)
      .then((r) => r.json())
      .then((b): EruvMaps => new Map(b?.ok && Array.isArray(b.maps) ? (b.maps as { id: string; map: EruvLineFile }[]).map((m) => [m.id, m.map]) : []))
      .catch((): EruvMaps => new Map())
    mapsCache.set(key, p)
    p.then((m) => m.size === 0 && mapsCache.delete(key))
  }
  return p
}

export function useEruvMaps(communitySlug: string, wanted = true, version: string | null = null): EruvMaps | null {
  const [data, setData] = useState<EruvMaps | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    fetchEruvMaps(communitySlug, version).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [communitySlug, wanted, version])
  return data
}
