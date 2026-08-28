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

const CONTACT_EMAIL = process.env.NOTIFICATION_TO || 'phillyjewishguide@gmail.com'

// A plain, top-level page (not under /[community]) — privacy applies to the
// whole site, not one community, same reasoning as /offline and /admin
// living outside that segment. Content is admin-editable (see /admin's Pages
// tab); this component fetches it and appends the contact line, which stays
// code (a live mailto: link, not something to retype into the admin editor).
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

        {/* Inside the same card, not below it: this is the policy's closing
            paragraph, and it only lives in code because the mailto has to be a
            live link. Splitting it out would read as a separate document. */}
        <div className="rich-text text-[16px] leading-[1.75] text-slate-700">
          <p>
          Questions about this policy, or want us to delete information you&rsquo;ve previously sent us?
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we&rsquo;ll take care of it.
          </p>
        </div>
      </div>
    </main>
  )
}
