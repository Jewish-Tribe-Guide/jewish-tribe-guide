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
    case 'find': {
      // 'find' means "open a category directory"; which one is in `extra`.
      const view = typeof extra?.findView === 'string' ? extra.findView : null
      if (!view) return routes.home(community)
      // findQuery/findItemId (set when navigating from a search result) become
      // the same ?q=/?item= params FindResources reads on mount, so the target
      // category opens pre-filtered with the tapped listing already expanded.
      // findAction ('edit'/'report', from a search result's Edit/Report button)
      // becomes ?form=, which FindResources resolves against the loaded listing
      // to open that form directly rather than just expanding the card.
      const query = typeof extra?.findQuery === 'string' ? extra.findQuery : null
      const itemId = typeof extra?.findItemId === 'string' ? extra.findItemId : null
      const action = typeof extra?.findAction === 'string' ? extra.findAction : null
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (itemId) params.set('item', itemId)
      if (action) params.set('form', action)
      const qs = params.toString()
      return qs ? `${routes.slug(community, view)}?${qs}` : routes.slug(community, view)
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
  goHome: (opts?: { at?: 'map' }) => void
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
      const params = new URLSearchParams()
      if (preselect?.length) params.set('need', preselect.join(','))
      const qs = params.toString()
      router.push(`${routes.slug(community, kind)}${qs ? `?${qs}` : ''}`)
    },
    [router, community],
  )

  const goHome = useCallback(
    (opts?: { at?: 'map' }) => {
      // `?at=map` lands the visitor on the home screen's embedded map band
      // rather than at the hero — used when collapsing the fullscreen map, so
      // the collapse reads as zooming out. Mobile's home screen has no map
      // band, so the param is simply ignored there.
      router.push(`${routes.home(community)}${opts?.at ? `?at=${opts.at}` : ''}`)
      // Tapping the mobile tab bar's Home button, or the header logo, while
      // already on home pushes the exact URL that's already loaded — Next
      // treats that as a no-op and never remounts Landing, so a typed search
      // (local state, not a URL param — see Landing) and scroll position
      // would otherwise just sit there, which isn't what "go home" means when
      // you're tapping it as a reset. Landing listens for this and clears
      // both by hand for that no-op case; a real cross-page navigation resets
      // them for free by remounting, so this is only load-bearing there.
      // Skipped for the `at: 'map'` case: that's always a real navigation
      // (only ever called from the full-map screen, a different pathname),
      // so it already resets on remount, and firing here too would race the
      // scroll-to-map-band effect that same navigation triggers.
      if (!opts?.at) document.dispatchEvent(new CustomEvent('jpc:go-home'))
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
    () => ({ navigate, openFlow, goHome, viewListing, viewMapForCategory }),
    [navigate, openFlow, goHome, viewListing, viewMapForCategory],
  )
}
