import UpButton from '@/components/UpButton'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { getPage } from '@/lib/pagesStore'
import { pageBodyToHtml } from '@/lib/richText'

// Self-referencing canonical — see [community]/page.tsx's comment on why
// every screen under [community] needs one.
export async function generateMetadata(props: PageProps<'/[community]/privacy'>): Promise<Metadata> {
  const { community: slug } = await props.params
  const [settings, communities] = await Promise.all([
    getSiteSettings(slug).catch(() => SITE_SETTINGS_DEFAULTS),
    listCommunities().catch(() => []),
  ])
  const communityRow = communities.find((c) => c.slug === slug)
  const name = settings.name || communityRow?.name || slug
  return {
    title: `Privacy Policy — ${name}`,
    description: `What ${name} collects, why, and what we do with it.`,
    alternates: { canonical: `${siteUrl()}${routes.privacy(slug)}` },
  }
}

// Community-scoped route (used to be a plain top-level /privacy, outside
// [community] entirely) purely for the chrome that comes with living under
// [community]/layout.tsx — see AboutPage's own doc for the full reasoning,
// identical here. The CONTENT stays one shared `page` row across every
// community (getPage takes no community argument).
//
// The closing "questions about this policy — email us" paragraph used to be
// appended here in code, on the grounds that a live mailto: link couldn't be
// expressed in the admin editor. That stopped being true when the Pages tab
// got a rich-text editor with link support, and the cost of leaving it was
// real: an admin looking at the Privacy page in the console saw text on the
// public page that was nowhere in the field they were editing. It lives in the
// body now, like every other sentence on the page.
//
// "Last updated" reads the row's own updated_at rather than a hardcoded
// string — a hand-maintained date would need a code change every time the
// text does, defeating the point of making this admin-editable at all.
// `community.timezone` here is the static app config (src/community.config.ts),
// not the per-community DB row — this app's zmanim/hours logic reads the same
// static value regardless of which community is browsing, so formatting a
// timestamp with it is consistent with everything else, not a shortcut.
export default async function PrivacyPage(props: PageProps<'/[community]/privacy'>) {
  const { community: slug } = await props.params
  const page = await getPage('privacy')
  const title = page?.title ?? 'Privacy Policy'
  const lastUpdated = page
    ? new Date(page.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: community.timezone,
      })
    : null

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      {/* The same control every other second-level screen uses, saying the
          same word — see AboutPage's own doc, including why this is
          mobile-only. Points at this community's own home (routes.home),
          not a bare "/", which redirects to whichever community is the
          site's default. */}
      <UpButton href={routes.home(slug)} label="Home" className="mb-0 desktop:hidden" />

      {/* One card holding the whole document — title included. See the same
          note on /about for why the h1 sits inside rather than above it, and
          why the back link doesn't. */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px]">
          {title}
        </h1>
        {lastUpdated && <p className="mt-1.5 text-sm text-muted">Last updated: {lastUpdated}</p>}

        {/* Admin-authored rich text — see the same note on /about. */}
        <div
          className="rich-text mt-7 text-[16px] leading-[1.75] text-slate-700"
          dangerouslySetInnerHTML={{ __html: pageBodyToHtml(page?.body) }}
        />
      </div>
    </main>
  )
}
