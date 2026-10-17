import PageDocument from '@/components/PageDocument'
import type { Metadata } from 'next'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { getPage } from '@/lib/pagesStore'

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

// Community-scoped route (used to be a plain top-level /about, outside
// [community] entirely) purely for the chrome that comes with living under
// [community]/layout.tsx: this page rendered with no SiteHeader and no
// SiteFooter at all before, since that's the one thing the old location
// opted out of. The CONTENT stays exactly what it was — one shared `page`
// row across every community (getPage takes no community argument; see
// pagesStore.ts) — a visitor reaches this page FROM some specific
// community's own screens, so it's that community's header/footer they see
// around the same shared copy, not a second "which community is this"
// decision. Content is admin-editable (see /admin's Pages tab); this
// component only renders it, and PageDocument (shared with /privacy) owns the
// layout — including why a phone shows each section in its own box.
export default async function AboutPage() {
  const page = await getPage('about')
  const title = page?.title ?? 'About'

  return <PageDocument title={title} body={page?.body} />
}
