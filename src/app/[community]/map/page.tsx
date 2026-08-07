import { Suspense } from 'react'
import MapScreen from './MapScreen'

// The map's whole view — category chips, search, field filters — lives in the
// query string, so a shared map link reopens the map the sender was looking at.
// Reading it needs the request, hence the boundary.
export default function MapPage() {
  return (
    <Suspense fallback={<main className="flex flex-1 flex-col" />}>
      <MapScreen />
    </Suspense>
  )
}
