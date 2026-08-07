import { Suspense } from 'react'
import MapScreen from './MapScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'

// The map's whole view — category chips, search, field filters — lives in the
// query string, so a shared map link reopens the map the sender was looking at.
// Reading it needs the request, hence the boundary.
export default async function MapPage(props: PageProps<'/[community]/map'>) {
  const { community } = await props.params
  // Every pin on the map, so the first paint has them rather than an empty map
  // that fills in a moment later.
  const listings = await listApprovedResources(community).catch((err) => {
    console.error('[map] listings failed to load:', err)
    return null
  })

  return (
    <ListingsProvider listings={listings}>
      <Suspense fallback={<main className="flex flex-1 flex-col" />}>
        <MapScreen />
      </Suspense>
    </ListingsProvider>
  )
}
