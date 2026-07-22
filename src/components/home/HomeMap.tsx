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
}: {
  onNavigate: NavigateFn
  coords: LatLng | null
}) {
  return (
    <ResourceMapView
      onUp={() => {}}
      userLocation={coords}
      onViewListing={(categoryId, listingId) =>
        onNavigate('patient', 'find', { findView: categoryId, findItemId: listingId })
      }
    />
  )
}
