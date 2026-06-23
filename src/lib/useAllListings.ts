'use client'

import { useEffect, useState } from 'react'
import type { DirectoryResource } from '@/types'

// Module-level cache — the landing search loads every approved listing once so it
// can match individual places (by name + tags) the moment the visitor types, with
// no per-keystroke network calls. Shared across mounts like `useCategories`.
let cache: DirectoryResource[] | null = null
let inflight: Promise<DirectoryResource[]> | null = null

/** Every approved listing across all categories, or null while loading.
 *  Powers the landing search's "Places" results. Calling `/api/resources` with
 *  no `?category=` returns the full set. */
export function useAllListings(): DirectoryResource[] | null {
  const [listings, setListings] = useState<DirectoryResource[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/resources')
      .then((res) => res.json())
      .then((body) => (body.ok ? (body.resources as DirectoryResource[]) : []))
      .catch(() => [])
    let active = true
    inflight.then((rows) => {
      cache = rows
      if (active) setListings(rows)
    })
    return () => {
      active = false
    }
  }, [])

  return listings
}
