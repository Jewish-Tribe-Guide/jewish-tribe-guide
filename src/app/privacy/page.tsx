import Link from 'next/link'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { siteUrl } from '@/lib/siteUrl'
import { getPage } from '@/lib/pagesStore'

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
const LAST_UPDATED = 'August 18, 2026'

// A plain, top-level page (not under /[community]) — privacy applies to the
// whole site, not one community, same reasoning as /offline and /admin
// living outside that segment. Content is admin-editable (see /admin's Pages
// tab); this component fetches it and appends the contact line, which stays
// code (a live mailto: link, not something to retype into the admin editor).
export default async function PrivacyPage() {
  const page = await getPage('privacy')
  const paragraphs = (page?.body ?? '').split(/\n\s*\n/).filter((p) => p.trim())

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-muted hover:text-slate-700 underline">
        ← Back to {community.name}
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
        {page?.title ?? 'Privacy Policy'}
      </h1>
      <p className="mt-1 text-sm text-muted">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p>
          Questions about this policy, or want us to delete information you&rsquo;ve previously sent us?
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>{' '}
          and we&rsquo;ll take care of it.
        </p>
      </div>
    </main>
  )
}
