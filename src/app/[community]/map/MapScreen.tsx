'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import ResourceMapView from '@/components/map/ResourceMapView'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { parseMapQuery, routes } from '@/lib/routes'
import { useCategoriesIfAny } from '@/lib/contentContext'
import { useCommunitySlug } from '@/lib/communityContext'
import { useCollapseHeader } from '@/lib/headerVisibility'
import { useIsMobile } from '@/lib/useIsMobile'

// ─────────────────────────────────────────────────────────────────────────────
// The map screen.
//
// Its view — which category chips are on, the search box, the field filters —
// is read from the query string rather than restored from history state, so a
// map link shares the map the sender was actually looking at.
//
// The old page.tsx kept this component mounted forever behind `display: none`
// so pan/zoom and the selected pin survived a tab switch. That hand-rolled
// hack is gone: with Cache Components, Next keeps recent routes alive with
// React's <Activity> instead of unmounting them, which preserves the same DOM
// and state for the same reason, without this page having to know about it.
// ─────────────────────────────────────────────────────────────────────────────
export default function MapScreen() {
  const params = useSearchParams()
  const router = useRouter()
  const { coords, liveTracking, controls } = useLocation()
  const { goHome, viewListing } = useSiteNavigation()
  const isMobile = useIsMobile()

  const view = parseMapQuery(params)
  const communitySlug = useCommunitySlug()
  const categories = useCategoriesIfAny()

  // Arrived from a category (its list's Map button, or a listing's map):
  // a ‹ back to it in the phone's search bar (board G1, Nov 16). Back is
  // the browser's, so a listing comes back as it was, the list where it was
  // scrolled to; a link opened on its own goes to the category instead.
  const fromCategory = view.from ? categories?.find((c) => c.id === view.from) : undefined
  const backTo = fromCategory
    ? {
        label: `Back to ${fromCategory.pluralLabel || fromCategory.label}`,
        onBack: () => {
          if (window.history.length > 1) router.back()
          else router.replace(routes.slug(communitySlug, fromCategory.id))
        },
      }
    : undefined

  // Exiting fullscreen goes back to whatever screen the visitor was actually
  // on before the map came up — a category directory's own "Map" button, the
  // header nav, the hero's "View Map", the mobile tab bar, all lead here, so
  // there's no one fixed "parent" the way UpButton's hierarchical nav assumes
  // elsewhere (see that component's own doc on why it deliberately avoids
  // history.back() everywhere else — the map is the one screen without a
  // single well-defined parent, which is exactly when real browser history is
  // the right tool). Falls back to home only when there's nothing to go back
  // to — a map link opened directly (bookmark, shared link, new tab) is the
  // first entry in its own history, and a no-op back would leave the visitor
  // stuck in fullscreen with the header covered and no way out.
  function exitToPreviousScreen() {
    if (window.history.length > 1) router.back()
    else goHome()
  }

  // The mobile map floats its own search bar and controls directly over the
  // map (see ResourceMapView), so the header above it is dead space competing
  // for the same screen — collapse it for as long as this screen is up. Only
  // on mobile: desktop's fullscreen map already paints over the header
  // itself (z-50 fixed layer, see ResourceMapView's own `controls` prop
  // doc), so there's nothing left for collapsing to do there.
  useCollapseHeader(isMobile)

  return (
    <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-0 pb-[calc(3.75rem+env(safe-area-inset-bottom))] sm:pt-8 sm:pb-8 animate-[fadeIn_180ms_ease-out]">
      <ResourceMapView
        onUp={goHome}
        userLocation={coords}
        initialSelectedCategories={view.categories ?? undefined}
        initialPinned={view.pinned}
        initialEruvim={view.eruvim}
        initialQuery={view.query ?? undefined}
        initialPlaceId={view.place ?? undefined}
        viewSearch={params.toString()}
        backTo={backTo}
        initialFilters={{
          openNow: view.openNow,
          openIn: view.openIn ?? undefined,
          bool: view.bool ?? undefined,
          select: view.select ?? undefined,
        }}
        onViewListing={viewListing}
        standalone
        visible
        // Landing on this screen always means fullscreen. Exiting (Escape, or
        // the fullscreen-toggle button) goes back to wherever the visitor was
        // before — see exitToPreviousScreen's own doc.
        onExitFullscreenToListing={exitToPreviousScreen}
        liveTracking={liveTracking}
        controls={controls}
      />
    </main>
  )
}
