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

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>

      {/* The body is admin-authored rich text. dangerouslySetInnerHTML is
          load-bearing here and safe only because pageBodyToHtml sanitizes
          against an allowlist — see lib/richText.ts, which is also what
          converts a body written before the editor existed. Never render
          page.body directly. */}
      <div
        className="rich-text mt-8 text-sm leading-relaxed text-slate-700"
        dangerouslySetInnerHTML={{ __html: pageBodyToHtml(page?.body) }}
      />
    </main>
  )
}
