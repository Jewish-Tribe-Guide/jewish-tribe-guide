import UpButton from '@/components/UpButton'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { siteUrl } from '@/lib/siteUrl'
import { getPage } from '@/lib/pagesStore'
import { pageBodyToHtml } from '@/lib/richText'

export const metadata: Metadata = {
  title: `Privacy Policy — ${community.name}`,
  description: `What ${community.name} collects, why, and what we do with it.`,
  // Self-referencing canonical — same reasoning as every page under
  // [community] now has (see [community]/page.tsx's comment). Static rather
  // than a generateMetadata function since this page has nothing dynamic to
  // read; the path itself is a fixed literal, not a route param.
  alternates: { canonical: `${siteUrl()}/privacy` },
}

// A plain, top-level page (not under /[community]) — privacy applies to the
// whole site, not one community, same reasoning as /offline and /admin
// living outside that segment. Content is admin-editable (see /admin's Pages
// tab); this component only renders it.
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
export default async function PrivacyPage() {
  const page = await getPage('privacy')
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
          same word. This used to be a bespoke underlined "← Back to
          {community.name}" link, which named its destination differently from
          the rest of the app for no reason anyone could point at. */}
      <UpButton href="/" label="Home" className="mb-0" />

      {/* One card holding the whole document — title included. See the same
          note on /about for why the h1 sits inside rather than above it, and
          why the back link doesn't. */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px]">
          {page?.title ?? 'Privacy Policy'}
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
