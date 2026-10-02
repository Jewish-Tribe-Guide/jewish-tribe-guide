import type { Metadata } from 'next'
import BrowseScreen from './BrowseScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// The Browse tab: every category, in the admin's groups (see BrowseAll).
export async function generateMetadata(props: PageProps<'/[community]/browse'>): Promise<Metadata> {
  const { community } = await props.params
  return {
    title: 'Browse',
    alternates: { canonical: `${siteUrl()}${routes.browse(community)}` },
  }
}

export default async function BrowsePage(props: PageProps<'/[community]/browse'>) {
  const { community } = await props.params
  // Every listing, for each category's count and live line, as the home and
  // the map load them.
  const listings = await listApprovedResources(community).catch((err) => {
    console.error('[browse] listings failed to load:', err)
    return null
  })
  return (
    <ListingsProvider listings={listings}>
      <BrowseScreen />
    </ListingsProvider>
  )
}
