import type { Metadata } from 'next'
import HomeScreen from './HomeScreen'
import { ListingsProvider } from '@/lib/listingsContext'
import { listApprovedResources } from '@/lib/resourceStore'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { buildJsonLdScript } from '@/lib/jsonLdScript'

// Self-referencing canonical — without one, Google has no signal for which
// URL is authoritative when it sees near-identical content at more than one
// (e.g. this page vs. "/" before it settles on the redirect target), and can
// pick the wrong one — exactly what happened here: Search Console reported
// this page as "Duplicate without user-selected canonical" and left it
// unindexed. Every other generateMetadata under [community] needs the same
// fix — see [slug]/page.tsx, [slug]/[id]/page.tsx, map/page.tsx, all/page.tsx.
export async function generateMetadata(props: PageProps<'/[community]'>): Promise<Metadata> {
  const { community } = await props.params
  return { alternates: { canonical: `${siteUrl()}${routes.home(community)}` } }
}

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
  const [listings, settings, communities] = await Promise.all([
    listApprovedResources(community).catch((err) => {
      console.error('[home] listings failed to load:', err)
      return null
    }),
    getSiteSettings(community).catch(() => SITE_SETTINGS_DEFAULTS),
    listCommunities().catch(() => []),
  ])
  // Same admin-edited-wins-over-community-row fallback as
  // [community]/layout.tsx's generateMetadata, so this never disagrees with
  // the page's own <title>/description.
  const communityRow = communities.find((c) => c.slug === community)
  const name = settings.name || communityRow?.name || community
  const description = settings.mission || communityRow?.mission || ''

  // WebSite structured data, home page only (not every screen under this
  // layout) — the standard place for it, and the one signal in this change
  // that's actually about how Google understands the site's identity for a
  // branded query, as opposed to whether it can crawl/index it at all (which
  // was already fine — see the redirect-status fix in proxy.ts/page.tsx).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: `${siteUrl()}${routes.home(community)}`,
    ...(description ? { description } : {}),
  }

  const jsonLdScript = buildJsonLdScript(jsonLd)

  return (
    <ListingsProvider listings={listings}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript }} />
      <HomeScreen />
    </ListingsProvider>
  )
}
