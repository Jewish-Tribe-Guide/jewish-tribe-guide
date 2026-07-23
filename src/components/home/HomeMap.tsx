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
  focusedCategoryId,
  onFocusCategoryChange,
  focusedCategoryItemIds,
}: {
  onNavigate: NavigateFn
  coords: LatLng | null
  /** Rendered beside the map, top-aligned with its border. */
  sidebar?: React.ReactNode
  /** The map point to isolate + zoom to — see ResourceMapView. */
  focusedListingId?: string | null
  onFocusListingChange?: (id: string | null) => void
  /** The category (or hospitals) to isolate + zoom-to-fit — see ResourceMapView. */
  focusedCategoryId?: string | null
  onFocusCategoryChange?: (id: string | null) => void
  /** The exact point ids surviving the isolated category's own filters —
   *  narrows the isolation further than the whole category. */
  focusedCategoryItemIds?: string[] | null
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
      focusedCategoryId={focusedCategoryId}
      onFocusCategoryChange={onFocusCategoryChange}
      focusedCategoryItemIds={focusedCategoryItemIds}
    />
  )
}
