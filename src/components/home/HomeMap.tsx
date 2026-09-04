'use client'

import ResourceMapView from '@/components/map/ResourceMapView'
import type { LocationControls } from '@/components/home/LocationControl'
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
  liveTracking,
  controls,
}: {
  onNavigate: NavigateFn
  coords: LatLng | null
  liveTracking: { tracking: boolean; error: string | null; start: () => void; stop: () => void }
  controls: LocationControls
}) {
  return (
    <ResourceMapView
      onUp={() => {}}
      userLocation={coords}
      liveTracking={liveTracking}
      controls={controls}
      onViewListing={(categoryId, listingId) =>
        onNavigate('patient', 'find', { findView: categoryId, findItemId: listingId })
      }
      // Expanded here, then narrowed to a phone: this embedded map has nowhere
      // to be on mobile (the home screen hides it entirely), so send the
      // visitor to the real map screen rather than dropping their map.
      onPromoteToMapScreen={() => onNavigate('patient', 'map')}
      // HomeMap is only ever the embedded home-screen usage — Landing.tsx
      // draws the single outer card (heading + border) around it now,
      // matching Browse everything, so this map draws no border of its own.
      borderless
    />
  )
}
