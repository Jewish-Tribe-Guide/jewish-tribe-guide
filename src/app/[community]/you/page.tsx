import type { Metadata } from 'next'
import YouScreen from './YouScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { ChangesProvider } from '@/lib/changesContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { listChangeLog } from '@/lib/changesStore'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'

// You (Oct 14, canvas page "you"): the visitor's saved places and saved
// searches, each with what it is now. What's saved lives on the device
// (pinned.ts, savedSearches.ts), so the page is the same for everyone and
// says nothing a search engine should index.
export async function generateMetadata(props: PageProps<'/[community]/you'>): Promise<Metadata> {
  const { community } = await props.params
  return {
    title: 'You',
    alternates: { canonical: `${siteUrl()}${routes.you(community)}` },
    robots: { index: false },
  }
}

export default async function YouPage(props: PageProps<'/[community]/you'>) {
  const { community } = await props.params
  // Saves can be in any category, so every listing, as the home and the map
  // load them; and the activity log, for what changed since the last look.
  // Either failing leaves its part out, not the page.
  const [listings, changes] = await Promise.all([
    listApprovedResources(community).catch((err) => {
      console.error('[you] listings failed to load:', err)
      return null
    }),
    listChangeLog(community).catch((err) => {
      console.error('[you] the activity log failed to load:', err)
      return null
    }),
  ])
  return (
    <ListingsProvider listings={listings}>
      <ChangesProvider rows={changes}>
        <YouScreen />
      </ChangesProvider>
    </ListingsProvider>
  )
}
