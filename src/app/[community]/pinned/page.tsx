import type { Metadata } from 'next'
import PinnedScreen from './PinnedScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// The visitor's pinned places. What's pinned lives on the device (pinned.ts),
// so the page itself is the same for everyone, and says nothing a search
// engine should index.
export async function generateMetadata(props: PageProps<'/[community]/pinned'>): Promise<Metadata> {
  const { community } = await props.params
  return {
    title: 'Pinned',
    alternates: { canonical: `${siteUrl()}${routes.pinned(community)}` },
    robots: { index: false },
  }
}

export default async function PinnedPage(props: PageProps<'/[community]/pinned'>) {
  const { community } = await props.params
  // Pins can be in any category, so every listing, as the home and the map
  // load them.
  const listings = await listApprovedResources(community).catch((err) => {
    console.error('[pinned] listings failed to load:', err)
    return null
  })
  return (
    <ListingsProvider listings={listings}>
      <PinnedScreen />
    </ListingsProvider>
  )
}
