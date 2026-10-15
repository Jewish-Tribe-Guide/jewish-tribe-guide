import type { ReactNode } from 'react'
import PageScreenHeader from '@/components/PageScreenHeader'
import { pageBodyToHtml, splitPageSections } from '@/lib/richText'

type Props = {
  title: string
  /** A muted line under the title — Privacy's "Last updated". */
  subtitle?: ReactNode
  /** The page row's raw body. Sanitized here; never render it any other way. */
  body: string | null | undefined
}

/** The About and Privacy pages: one admin-authored document, laid out two ways.
 *
 *  Phone: a drill-down screen like a category page. The title moves into the
 *  header as "‹ {title}" (PageScreenHeader), so the h1 stays only for screen
 *  readers, and each section of the body — split at its headings — sits in a
 *  white box of its own, the way the rest of the app's content does. A single
 *  box around a long document read as one grey-edged slab on a small screen;
 *  per-section boxes give the page the same rhythm as the listing cards.
 *
 *  Desktop: one card holding the whole document, title included, as before.
 *  The h1 sits inside the card rather than above it because the heading-above-
 *  cards pattern comes from the category screens, where one heading introduces
 *  many cards. Padding grows rather than the column — 16px prose at this width
 *  is already ~80 characters a line. The sections are still separate elements
 *  there but carry no box (see `.rich-text-section` in globals.css), so the
 *  text renders exactly as the unsplit body did. */
export default function PageDocument({ title, subtitle, body }: Props) {
  // dangerouslySetInnerHTML below is load-bearing and safe only because
  // pageBodyToHtml sanitizes against an allowlist — see lib/richText.ts.
  const sections = splitPageSections(pageBodyToHtml(body))

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-12 sm:px-6 desktop:py-16">
      <PageScreenHeader title={title} />
      <div className="desktop:rounded-lg desktop:border desktop:border-slate-200 desktop:bg-white desktop:p-10 desktop:shadow-sm">
        <h1 className="sr-only desktop:not-sr-only desktop:block desktop:text-[34px] desktop:font-bold desktop:leading-tight desktop:tracking-tight desktop:text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mx-0.5 text-sm text-muted desktop:mx-0 desktop:mt-1.5">{subtitle}</p>}
        <div className="rich-text mt-3 text-[16px] leading-[1.75] text-slate-700 desktop:mt-7">
          {sections.map((html, i) => (
            <div key={i} className="rich-text-section" dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </div>
      </div>
    </main>
  )
}
