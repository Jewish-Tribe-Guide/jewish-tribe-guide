import { Suspense } from 'react'
import AboutDocument from '@/components/pages/AboutDocument'
import { listCategories } from '@/lib/categoryStore'
import { listApprovedResources } from '@/lib/resourceStore'
import type { Metadata } from 'next'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { getPage } from '@/lib/pagesStore'
import { aboutCount } from '@/lib/pageSections'

// Self-referencing canonical — see [community]/page.tsx's comment on why
// every screen under [community] needs one.
export async function generateMetadata(props: PageProps<'/[community]/about'>): Promise<Metadata> {
  const { community } = await props.params
  const [settings, communities] = await Promise.all([
    getSiteSettings(community).catch(() => SITE_SETTINGS_DEFAULTS),
    listCommunities().catch(() => []),
  ])
  // Same admin-edited-wins-over-community-row fallback [community]/layout.tsx's
  // own generateMetadata uses, so this never disagrees with the rest of the site.
  const communityRow = communities.find((c) => c.slug === community)
  const name = settings.name || communityRow?.name || community
  return {
    title: `About — ${name}`,
    description: `The story behind the ${name} guide.`,
    alternates: { canonical: `${siteUrl()}${routes.about(community)}` },
  }
}

// Community-scoped route (it used to be a plain top-level /about): it lives
// under [community]/layout.tsx for that community's header and footer. The
// TEXT is one shared `page` row across every community (getPage takes no
// community argument; see pagesStore.ts), edited in /admin's Pages tab, so it
// is written to fit any community. AboutDocument owns the layout.
//
// The count over the title is the community's own, and the only thing here
// that reads the address, so it alone sits in a Suspense boundary: the rest
// of the page, the same for every community, is in the App Shell, and a
// navigation to About shows it at once while the count streams in (Next's
// "URL data outside of <Suspense>" check, Nov 26). A prerendered
// community's About still has the count in its HTML.
export default async function AboutPage(props: PageProps<'/[community]/about'>) {
  const page = await getPage('about')
  const count = (
    <Suspense fallback={null}>
      <AboutCount params={props.params} />
    </Suspense>
  )
  return <AboutDocument title={page?.title ?? 'About'} eyebrow={count} body={page?.body} />
}

async function AboutCount({ params }: Pick<PageProps<'/[community]/about'>, 'params'>) {
  const { community } = await params
  const [categories, listings] = await Promise.all([
    listCategories(community).catch(() => []),
    listApprovedResources(community).catch(() => []),
  ])
  const shown = new Set(categories.map((c) => c.id))
  return aboutCount(listings.filter((l) => shown.has(l.category)).length, shown.size)
}
