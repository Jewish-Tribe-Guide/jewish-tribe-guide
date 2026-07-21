'use client'

import { useEffect, useState } from 'react'
import type { HomeSection } from '@/lib/homeSections'

// Module-level cache — one fetch shared by every consumer (just the landing
// page today).
let cache: HomeSection[] | null = null
let inflight: Promise<HomeSection[]> | null = null

/** The admin-configured home-screen sections, or null while loading. Falls
 *  back to an empty list (everything lands in the trailing "More" section) if
 *  the API is unreachable. */
export function useHomeSections(): HomeSection[] | null {
  const [sections, setSections] = useState<HomeSection[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/home-sections')
      .then((res) => res.json())
      .then((body) => (body.ok ? (body.sections as HomeSection[]) : []))
      .catch(() => [])
    let active = true
    inflight.then((loaded) => {
      cache = loaded
      if (active) setSections(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  return sections
}
