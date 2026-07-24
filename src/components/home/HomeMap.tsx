'use client'

import ResourceMapView from '@/components/map/ResourceMapView'
import type { LatLng } from '@/lib/googleMapsLinks'
import type { NavigateFn } from '@/types'

/** The actual full map screen (search, category filter chips, live location
 *  tracking, Nearby list — everything ResourceMapView normally shows behind
 *  its own "View Map" navigation), embedded directly on the home screen
 *  instead of behind a button. Experimental — see if this earns its space
 *  better than the button/pins-only preview it replaced. */
export default function HomeMap({
  onNavigate,
  coords,
  sidebar,
  focusedListingId,
  onFocusListingChange,
  focusedCategoryIds,
  onFocusCategoryChange,
  categoryItemIdsByCategory,
}: {
  onNavigate: NavigateFn
  coords: LatLng | null
  /** Rendered beside the map, top-aligned with its border. */
  sidebar?: React.ReactNode
  /** The map point to isolate + zoom to — see ResourceMapView. */
  focusedListingId?: string | null
  onFocusListingChange?: (id: string | null) => void
  /** Every category (or hospitals) currently isolated + zoomed-to-fit
   *  together — see ResourceMapView. */
  focusedCategoryIds?: Set<string>
  /** Toggles one category's membership in `focusedCategoryIds` — called by
   *  the map's own bottom key bar, see ResourceMapView. */
  onFocusCategoryChange?: (id: string) => void
  /** The exact point ids surviving each isolated category's own filters,
   *  keyed by category — narrows each one's isolation further than the
   *  whole category. */
  categoryItemIdsByCategory?: Record<string, string[]>
}) {
  return (
    <ResourceMapView
      onUp={() => {}}
      userLocation={coords}
      onViewListing={(categoryId, listingId) =>
        onNavigate('patient', 'find', { findView: categoryId, findItemId: listingId })
      }
      sidebar={sidebar}
      focusedListingId={focusedListingId}
      onFocusListingChange={onFocusListingChange}
      focusedCategoryIds={focusedCategoryIds}
      onFocusCategoryChange={onFocusCategoryChange}
      categoryItemIdsByCategory={categoryItemIdsByCategory}
    />
  )
}
