import UpButton from '@/components/UpButton'
import type { Metadata } from 'next'
import { listCommunities } from '@/lib/communityStore'
import { getSiteSettings } from '@/lib/siteSettingsStore'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import { siteUrl } from '@/lib/siteUrl'
import { routes } from '@/lib/routes'
import { getPage } from '@/lib/pagesStore'
import { pageBodyToHtml } from '@/lib/richText'

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
// component only renders it.
export default async function AboutPage(props: PageProps<'/[community]/about'>) {
  const { community } = await props.params
  const page = await getPage('about')
  const title = page?.title ?? 'About'

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      {/* The same control every other second-level screen uses, saying the
          same word. This used to be a bespoke underlined "← Back to
          {community.name}" link, which named its destination differently from
          the rest of the app for no reason anyone could point at.
          Mobile-only: desktop already has a permanent way back to Home (the
          site logo in the header, always on screen), so a second link here
          — and a second, redundant "Home / {title}" naming the exact same
          destination right above a heading that already says {title} — used
          to render on desktop for no real benefit; removed rather than kept
          around just because it was harmless. Points at this community's own
          home (routes.home), not a bare "/" — "/" redirects to whichever
          community is the site's default, which isn't necessarily the one
          this page was reached from. */}
      <UpButton href={routes.home(community)} label="Home" className="mb-0 desktop:hidden" />

      {/* One card holding the whole document — title included. The h1 sits
          inside rather than above because these two pages are documents, not
          lists: the heading-above-cards pattern comes from the category
          screens, where one heading introduces MANY cards, and borrowing it
          for a single card leaves the title floating over a container instead
          of belonging to it. The back link stays outside, since that's
          navigation rather than part of the document.
          Deliberately ONE card and not one per section: a card says "discrete,
          self-contained item", which is true of a listing and false of a
          document you read top to bottom.
          Padding grows on desktop rather than the column — 16px prose at this
          width is already ~80 characters a line, which is the upper limit of
          comfortable, so "bigger" has to mean more margin, not longer lines. */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px]">
          {title}
        </h1>

        {/* The body is admin-authored rich text. dangerouslySetInnerHTML is
            load-bearing here and safe only because pageBodyToHtml sanitizes
            against an allowlist — see lib/richText.ts. Never render
            page.body directly. */}
        <div
          className="rich-text mt-7 text-[16px] leading-[1.75] text-slate-700"
          dangerouslySetInnerHTML={{ __html: pageBodyToHtml(page?.body) }}
        />
      </div>
    </main>
  )
}
