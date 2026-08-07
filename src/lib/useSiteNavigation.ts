'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { AppMode, MapFilters, NavigateFn } from '@/types'
import { useCommunitySlug } from './communityContext'
import { mapQueryString, routes } from './routes'

// ─────────────────────────────────────────────────────────────────────────────
// The navigation functions every screen already takes as props, reimplemented
// on top of the router.
//
// These used to live in src/app/page.tsx as a state machine: a `mode` in
// useState, a hand-built NavState pushed into history.state, a popstate
// listener copying it back into a dozen useStates, and mirror copies of state
// that really belonged to the map. Browser back, a reload, and a resize each
// had to be handled by hand, and the bugs were exactly where you'd expect.
//
// Now the URL is the state. `navigate` maps an AppMode onto a path and pushes
// it; back and forward are the browser's own, and a reload re-reads the URL.
// The prop signatures are unchanged, so the ~24 components that navigate did
// not have to be touched.
// ─────────────────────────────────────────────────────────────────────────────

/** Maps the legacy AppMode onto a path within a community. */
function pathForMode(community: string, mode: AppMode, extra?: Record<string, unknown>): string {
  switch (mode) {
    case 'map':
      return routes.map(community)
    case 'feedback':
      return routes.feedback(community)
    case 'all-categories':
      return routes.allCategories(community)
    case 'find': {
      // 'find' means "open a category directory"; which one is in `extra`.
      const view = typeof extra?.findView === 'string' ? extra.findView : null
      return view ? routes.slug(community, view) : routes.allCategories(community)
    }
    // 'home', 'community-home' and the retired audience modes all land home.
    default:
      return routes.home(community)
  }
}

export type SiteNavigation = {
  /** The shared NavigateFn every screen takes. */
  navigate: NavigateFn
  /** Opens a guided form — a category-or-form slug under the community. */
  openFlow: (kind: string, preselect?: string[]) => void
  goHome: () => void
  viewAllCategories: (section?: string) => void
  viewListing: (categoryId: string, listingId: string) => void
  viewMapForCategory: (categoryId: string, query?: string, filters?: MapFilters) => void
}

export function useSiteNavigation(): SiteNavigation {
  const router = useRouter()
  const community = useCommunitySlug()

  const navigate = useCallback<NavigateFn>(
    (_audience, mode, extra) => {
      router.push(pathForMode(community, mode, extra))
    },
    [router, community],
  )

  const openFlow = useCallback(
    (kind: string, preselect?: string[]) => {
      // A form's pre-checked needs ride in the query string so the link is
      // shareable and survives a reload — they used to live in history.state,
      // which neither did.
      const qs = preselect?.length ? `?need=${encodeURIComponent(preselect.join(','))}` : ''
      router.push(`${routes.slug(community, kind)}${qs}`)
    },
    [router, community],
  )

  const goHome = useCallback(() => {
    router.push(routes.home(community))
  }, [router, community])

  const viewAllCategories = useCallback(
    (section?: string) => {
      // The section to scroll to is a fragment, which is exactly what fragments
      // are for — and it means a link to one section of the index is shareable.
      router.push(`${routes.allCategories(community)}${section ? `#${section}` : ''}`)
    },
    [router, community],
  )

  const viewListing = useCallback(
    (categoryId: string, listingId: string) => {
      router.push(routes.listing(community, categoryId, listingId))
    },
    [router, community],
  )

  const viewMapForCategory = useCallback(
    (categoryId: string, query?: string, filters?: MapFilters) => {
      const qs = mapQueryString({
        categories: [categoryId],
        query,
        openNow: filters?.openNow,
        bool: filters?.bool,
        select: filters?.select,
      })
      router.push(`${routes.map(community)}${qs}`)
    },
    [router, community],
  )

  return useMemo(
    () => ({ navigate, openFlow, goHome, viewAllCategories, viewListing, viewMapForCategory }),
    [navigate, openFlow, goHome, viewAllCategories, viewListing, viewMapForCategory],
  )
}
