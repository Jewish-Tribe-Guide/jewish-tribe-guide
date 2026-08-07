'use client'

import type { DirectoryResource } from '@/types'
import { useCommunityData } from './useCommunityData'

/** Every approved listing across all categories, or null while loading.
 *  Powers the landing search's "Places" results. Calling `/api/resources` with
 *  no `?category=` returns the full set for the active community. Cached per
 *  community by useCommunityData, so switching refetches and switching back is
 *  instant. */
export function useAllListings(): DirectoryResource[] | null {
  const { data } = useCommunityData<DirectoryResource[] | null>(
    '/api/resources',
    (url) =>
      fetch(url)
        .then((res) => res.json())
        .then((body) => (body.ok ? (body.resources as DirectoryResource[]) : []))
        .catch(() => []),
    null,
  )
  return data
}
