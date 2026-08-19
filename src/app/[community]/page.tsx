import HomeScreen from './HomeScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'

// No Suspense boundary here — HomeScreen doesn't call useSearchParams()
// itself (that's isolated inside LandingConnected, with its own narrow
// boundary right around the one piece that needs it), so nothing in this
// tree suspends on a Dynamic API and the whole page prerenders for real.
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
      <HomeScreen />
    </ListingsProvider>
  )
}
