'use client'

import { useSearchParams } from 'next/navigation'
import ResourceMapView from '@/components/map/ResourceMapView'
import { useLocation } from '@/lib/locationContext'
import { useSiteNavigation } from '@/lib/useSiteNavigation'
import { parseMapQuery } from '@/lib/routes'
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
  const { coords, liveTracking, controls } = useLocation()
  const { goHome, viewListing } = useSiteNavigation()
  const isMobile = useIsMobile()

  const view = parseMapQuery(params)

  // The mobile map floats its own search bar and controls directly over the
  // map (see ResourceMapView), so the header above it is dead space competing
  // for the same screen — collapse it for as long as this screen is up. Only
  // on mobile: desktop's map is a contained card, not an immersive fullscreen
  // view, and the header isn't in its way.
  useCollapseHeader(isMobile)

  return (
    <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-0 pb-[calc(3.75rem+env(safe-area-inset-bottom))] sm:pt-8 sm:pb-8">
      <ResourceMapView
        onUp={goHome}
        userLocation={coords}
        initialSelectedCategories={view.categories ?? undefined}
        initialQuery={view.query ?? undefined}
        initialPlaceId={view.place ?? undefined}
        initialFilters={{
          openNow: view.openNow,
          bool: view.bool ?? undefined,
          select: view.select ?? undefined,
        }}
        onViewListing={viewListing}
        standalone
        visible
        // Landing on this screen always means fullscreen. Exiting collapses to
        // the home screen's embedded map band on desktop — `?at=map` tells the
        // home page to scroll there, so the exit reads as zooming out rather
        // than being dropped somewhere unrelated.
        onExitFullscreenToListing={() => goHome({ at: 'map' })}
        liveTracking={liveTracking}
        controls={controls}
      />
    </main>
  )
}
