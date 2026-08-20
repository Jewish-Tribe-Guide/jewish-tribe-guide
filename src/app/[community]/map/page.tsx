import { Suspense } from 'react'
import type { Metadata } from 'next'
import MapScreen from './MapScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// Self-referencing canonical — see [community]/page.tsx's comment. Points at
// the bare /map URL regardless of query string (filters), since those are a
// view of the same page, not a different one worth indexing separately.
export async function generateMetadata(props: PageProps<'/[community]/map'>): Promise<Metadata> {
  const { community } = await props.params
  return { alternates: { canonical: `${siteUrl()}${routes.map(community)}` } }
}

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
