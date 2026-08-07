'use client'

import type { Hospital } from '@/types'
import { useCommunityData } from './useCommunityData'

/** The hospital list for the active community, or null while loading. Empty
 *  array for a non-hospital community (or if the API is unreachable). */
export function useHospitals(): Hospital[] | null {
  const { data } = useCommunityData<Hospital[] | null>(
    '/api/hospitals',
    (url) =>
      fetch(url)
        .then((res) => res.json())
        .then((body) => (body.ok ? (body.hospitals as Hospital[]) : []))
        .catch(() => []),
    null,
  )
  return data
}
