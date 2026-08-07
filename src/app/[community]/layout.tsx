import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { CommunityProvider } from '@/lib/communityContext'
import { ContentProvider } from '@/lib/contentContext'
import { loadCommunityContent } from '@/lib/loadCommunityContent'
import SiteChrome from '@/components/SiteChrome'
import { currentYear } from '@/lib/currentYear'

// ─────────────────────────────────────────────────────────────────────────────
// Everything public lives under a community segment.
//
// The community is resolved here, on the server, from the path — so the page
// already knows which directory it is before any JavaScript runs. An unknown
// slug 404s rather than silently falling back to the default: /baltimore when
// Baltimore doesn't exist should say so, not quietly show Philadelphia under a
// Baltimore URL.
//
// This layout persists across navigations between the screens below it, which
// is what lets SiteChrome hold the GPS watch and the header without either
// restarting on every move.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveFromPath(slug: string) {
  const communities = await listCommunities()
  const community = communities.find((c) => c.slug === slug)
  return { community, communities }
}

export async function generateMetadata(props: LayoutProps<'/[community]'>): Promise<Metadata> {
  const { community: slug } = await props.params
  const { community } = await resolveFromPath(slug)
  if (!community) return {}

  // Admin-edited name/mission win; the community row is the fallback, and the
  // built-in defaults cover a settings table that hasn't been migrated yet.
  const settings = await getSiteSettings(community.slug).catch(() => SITE_SETTINGS_DEFAULTS)
  const title = settings.name || community.name
  const description = settings.mission || community.mission

  return {
    title,
    description,
    // Shared links land in WhatsApp and iMessage far more often than in a
    // browser address bar, so the preview card is the first impression.
    openGraph: {
      title,
      description,
      siteName: title,
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  }
}

/** Prerenders a page per community at build time. The list is small and
 *  changes when an admin adds a community, not per request. */
export async function generateStaticParams() {
  const communities = await listCommunities()
  return communities.map((c) => ({ community: c.slug }))
}

export default async function CommunityLayout(props: LayoutProps<'/[community]'>) {
  const { community: slug } = await props.params
  const { community, communities } = await resolveFromPath(slug)
  if (!community) notFound()

  // Fetched here, on the server, so the HTML ships with the real categories,
  // branding and sections instead of the five client-side requests these used
  // to be. The layout is the right place: every screen below it needs this,
  // and it isn't re-fetched when navigating between them.
  const content = await loadCommunityContent(community.slug)

  return (
    <CommunityProvider community={community} communities={communities}>
      <ContentProvider content={content}>
        {/* The brand color is per-community now, so it's set here rather than on
            <html> in the root layout — switching community restyles the site
            without a reload. globals.css still holds the build-time fallback. */}
        <div
          className="contents"
          style={{ '--color-primary': community.themeColor } as React.CSSProperties}
        >
          <SiteChrome year={await currentYear()}>{props.children}</SiteChrome>
        </div>
      </ContentProvider>
    </CommunityProvider>
  )
}
