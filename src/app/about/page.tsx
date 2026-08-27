import UpButton from '@/components/UpButton'
import type { Metadata } from 'next'
import { community } from '@/community.config'
import { siteUrl } from '@/lib/siteUrl'
import { getPage } from '@/lib/pagesStore'
import { pageBodyToHtml } from '@/lib/richText'

export const metadata: Metadata = {
  title: `About — ${community.name}`,
  description: `The story behind the ${community.name} guide.`,
  alternates: { canonical: `${siteUrl()}/about` },
}

// A plain, top-level page (not under /[community]) — same reasoning as
// /privacy: this is one site's worth of copy, not something that varies by
// community. Content is admin-editable (see /admin's Pages tab); this
// component only renders it.
export default async function AboutPage() {
  const page = await getPage('about')
  const title = page?.title ?? 'About'

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16">
      {/* The same control every other second-level screen uses, saying the
          same word. This used to be a bespoke underlined "← Back to
          {community.name}" link, which named its destination differently from
          the rest of the app for no reason anyone could point at. */}
      <UpButton href="/" label="Home" className="mb-0" />

      <h1 className="mt-6 text-[30px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px]">{title}</h1>

      {/* One card around the whole document, using the app's own card token —
          the same one the admin panels and listing rows use, so these pages
          read as part of the site rather than as text on a bare background.
          Deliberately ONE card and not one per section: a card says "discrete,
          self-contained item", which is true of a listing and false of a
          document you read top to bottom.
          The 16px inside it is a departure from the app's text-sm default on
          purpose — everywhere else is dense UI, this is prose read end to
          end. */}
      {/* The body is admin-authored rich text. dangerouslySetInnerHTML is
          load-bearing here and safe only because pageBodyToHtml sanitizes
          against an allowlist — see lib/richText.ts. Never render page.body
          directly. */}
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div
          className="rich-text text-[16px] leading-[1.75] text-slate-700"
          dangerouslySetInnerHTML={{ __html: pageBodyToHtml(page?.body) }}
        />
      </div>
    </main>
  )
}
