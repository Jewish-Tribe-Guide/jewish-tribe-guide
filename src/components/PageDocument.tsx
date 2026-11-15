import type { ReactNode } from 'react'
import PageScreenHeader from '@/components/PageScreenHeader'
import { pageBodyToHtml, splitPageSections } from '@/lib/richText'
import PhotoHeader from '@/components/PhotoHeader'
import { PAGE_COLUMN } from '@/lib/pageColumn'

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
 *  Desktop (board W11, the user, Nov 15): the category pages' photo with
 *  the title on it (PhotoHeader), and the document in one white card under
 *  it, left-aligned with the title and no wider than 760px, about 80
 *  characters of 16px prose a line. The sections are still separate elements
 *  there but carry no box (see `.rich-text-section` in globals.css), so the
 *  text renders exactly as the unsplit body did. */
export default function PageDocument({ title, subtitle, body }: Props) {
  // dangerouslySetInnerHTML below is load-bearing and safe only because
  // pageBodyToHtml sanitizes against an allowlist — see lib/richText.ts.
  const sections = splitPageSections(pageBodyToHtml(body))

  return (
    <main className={`${PAGE_COLUMN} pt-4 pb-12 desktop:pt-8`}>
      <PageScreenHeader title={title} />
      <PhotoHeader title={title}>
        <div data-testid="page-document" className="desktop:max-w-[760px] desktop:rounded-lg desktop:border desktop:border-slate-200 desktop:bg-white desktop:p-10 desktop:shadow-sm">
          {/* A phone's, for screen readers: the header says it. A computer's
              is on the photo. */}
          <h1 className="sr-only desktop:hidden">{title}</h1>
          {subtitle && <p className="mx-0.5 text-sm text-muted desktop:mx-0 desktop:mb-5">{subtitle}</p>}
          <div className="rich-text mt-3 text-[16px] leading-[1.75] text-slate-700 desktop:mt-0">
            {sections.map((html, i) => (
              <div key={i} className="rich-text-section" dangerouslySetInnerHTML={{ __html: html }} />
            ))}
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
