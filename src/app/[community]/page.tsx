import { Suspense } from 'react'
import HomeScreen from './HomeScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'

// The Suspense boundary is what lets this page prerender. HomeScreen reads
// `?at=map` with useSearchParams, which can't resolve at build time — the
// boundary means the shell is still static and only the part that needs the
// query string waits for the request. Same pattern on every screen below that
// reads search params.
export default async function HomePage(props: PageProps<'/[community]'>) {
  const { community } = await props.params
  // The home screen's search covers every place, and the embedded map plots
  // them all, so this is the one screen that genuinely needs the full set.
  // Loaded here rather than fetched after hydration, so the search works on
  // first paint. null on failure — see listingsContext.
  const listings = await listApprovedResources(community).catch((err) => {
    console.error('[home] listings failed to load:', err)
    return null
  })

  return (
    <ListingsProvider listings={listings}>
      <Suspense fallback={<div className="flex-1" />}>
        <HomeScreen />
      </Suspense>
    </ListingsProvider>
  )
}
