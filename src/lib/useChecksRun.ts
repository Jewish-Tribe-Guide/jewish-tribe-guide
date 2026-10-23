'use client'

import { useEffect, useState } from 'react'
import type { CheckRan } from './checksRun'

// The checks the guide ran (/api/checks), for the trust sheet's "We check
// it every day": fetched once per community per page load. Null until it
// arrives; empty when it can't be fetched, so the sheet still opens.

const cache = new Map<string, Promise<CheckRan[]>>()
const arrived = new Map<string, CheckRan[]>()

export function fetchChecksRun(communitySlug: string): Promise<CheckRan[]> {
  let p = cache.get(communitySlug)
  if (!p) {
    const asked = fetch(`/api/checks?community=${encodeURIComponent(communitySlug)}`)
      .then((r) => r.json())
      .then((b) => (b?.ok && Array.isArray(b.checks) ? (b.checks as CheckRan[]) : null))
      .catch(() => null)
    p = asked.then((c) => c ?? [])
    cache.set(communitySlug, p)
    asked.then((c) => {
      arrived.set(communitySlug, c ?? [])
      // A failure isn't kept: the next page asks again.
      if (!c) cache.delete(communitySlug)
    })
  }
  return p
}

/** For tests. */
export function clearChecksRun(): void {
  cache.clear()
  arrived.clear()
}

export function useChecksRun(communitySlug: string, wanted = true): CheckRan[] | null {
  const [data, setData] = useState<CheckRan[] | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    fetchChecksRun(communitySlug).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [communitySlug, wanted])
  return data ?? (wanted ? (arrived.get(communitySlug) ?? null) : null)
}
