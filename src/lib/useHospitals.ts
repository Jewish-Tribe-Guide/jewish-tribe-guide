'use client'

import { useEffect, useState } from 'react'
import type { Hospital } from '@/types'

// Module-level cache — the map, the Hospitals directory, and the volunteer form
// all want the list, so fetch it once per page load and share it. Mirrors
// useCategories / useAllListings.
let cache: Hospital[] | null = null
let inflight: Promise<Hospital[]> | null = null

/** The hospital list, or null while loading. Empty array for a non-hospital
 *  community (or if the API is unreachable). */
export function useHospitals(): Hospital[] | null {
  const [hospitals, setHospitals] = useState<Hospital[] | null>(cache)

  useEffect(() => {
    if (cache) return
    inflight ??= fetch('/api/hospitals')
      .then((res) => res.json())
      .then((body) => (body.ok ? (body.hospitals as Hospital[]) : []))
      .catch(() => [])
    let active = true
    inflight.then((rows) => {
      cache = rows
      if (active) setHospitals(rows)
    })
    return () => {
      active = false
    }
  }, [])

  return hospitals
}
