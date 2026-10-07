'use client'

import { useEffect, useState } from 'react'
import type { Eruv } from './eruv'

// The eruvim and their statuses (/api/eruv), fetched once per community per
// page load and shared: a hospital listing's Shabbos box and the home's
// "Your eruv" ask for the same thing. Null until it arrives; `available`
// false without migration 074, or when it can't be fetched.

export type EruvStatuses = { available: false } | { available: true; timezone: string; candles: number | null; eruvim: Eruv[] }

const cache = new Map<string, Promise<EruvStatuses>>()

export function fetchEruvStatuses(communitySlug: string): Promise<EruvStatuses> {
  let p = cache.get(communitySlug)
  if (!p) {
    p = fetch(`/api/eruv?community=${encodeURIComponent(communitySlug)}`)
      .then((r) => r.json())
      .then((b): EruvStatuses => (b?.ok && b.available ? { available: true, timezone: b.timezone, candles: b.candles ?? null, eruvim: b.eruvim } : { available: false }))
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
