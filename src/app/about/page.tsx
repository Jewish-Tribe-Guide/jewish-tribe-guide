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
