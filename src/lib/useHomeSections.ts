'use client'

import type { HomeSection } from '@/lib/homeSections'
import { draftSectionsAsHomeSections, readPreviewDraft } from './previewDraft'
import { useCommunityData } from './useCommunityData'

/** The admin-configured home-screen sections for the active community, or null
 *  while loading. Falls back to an empty list (everything lands in the trailing
 *  "More" section) if the API is unreachable. */
export function useHomeSections(): HomeSection[] | null {
  const { data } = useCommunityData<HomeSection[] | null>(
    '/api/home-sections',
    (url) => {
      // Admin preview: the draft grouping, not the saved one. Checked inside
      // the loader so it short-circuits the fetch entirely, and cached under
      // the same per-community key as a real load would be.
      const draft = readPreviewDraft()
      if (draft) return Promise.resolve(draftSectionsAsHomeSections(draft.sections))
      return fetch(url)
        .then((res) => res.json())
        .then((body) => (body.ok ? (body.sections as HomeSection[]) : []))
        .catch(() => [])
    },
    null,
  )
  return data
}
