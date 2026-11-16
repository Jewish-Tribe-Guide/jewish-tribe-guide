import PageScreenHeader from '@/components/PageScreenHeader'
import PhotoHeader from '@/components/PhotoHeader'
import { PAGE_COLUMN } from '@/lib/pageColumn'
import { pageBodyToHtml } from '@/lib/richText'
import { pageDocumentParts, pointGlyph, type PageSection } from '@/lib/pageSections'
import { GlyphDot } from './PageGlyph'
import PageContents from './PageContents'
import PrivacyDetails, { SectionBody } from './PrivacyDetails'
import { BOX } from './AboutDocument'

type Props = {
  title: string
  /** "Updated November 15, 2026". */
  updated?: string | null
  /** The page row's raw body. Sanitized here; never render it any other way. */
  body: string | null | undefined
}

/** The first section, always open: "The short version". Named points are
 *  rows with an icon; anything else is its text. */
function ShortVersion({ section }: { section: PageSection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className={`${BOX} px-4 py-[18px] desktop:scroll-mt-24 desktop:px-9 desktop:py-[30px]`}>
      <h2 id={`${section.id}-h`} className="mb-4 text-[19px] font-bold text-slate-900">{section.heading}</h2>
      {section.points && !section.points.before && !section.points.after ? (
        <ul className="flex flex-col gap-3.5 text-[15.5px] leading-[1.5] text-slate-700 desktop:gap-4 desktop:text-[16px]">
          {section.points.items.map((item) => (
            <li key={item.title} className="flex gap-3.5">
              <GlyphDot name={pointGlyph(item.title)} />
              <div className="min-w-0">
                <strong className="block text-slate-900">{item.title}</strong>
                <span className="rich-text" dangerouslySetInnerHTML={{ __html: item.html }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <SectionBody section={section} className="text-[16px] leading-[1.7] text-slate-700" />
      )}
    </section>
  )
}

/** The Privacy and terms page (board "Privacy and terms", the user, Nov 15):
 *  the short version first, then the details. A computer has a contents
 *  list beside them; a phone has them as rows that open. All of it is the
 *  admin's text, laid out from its shape (pageSections.ts). */
export default function PrivacyDocument({ title, updated, body }: Props) {
  const { lead, sections } = pageDocumentParts(pageBodyToHtml(body))
  const [first, ...rest] = sections

  return (
    <main className={`${PAGE_COLUMN} pt-4 pb-12 desktop:pt-8`}>
      <PageScreenHeader title={title} />
      <PhotoHeader eyebrow={updated} title={title}>
        <div data-testid="page-document" className="desktop:grid desktop:grid-cols-[240px_minmax(0,760px)] desktop:items-start desktop:gap-10 desktop:pt-3">
          {sections.length > 1 ? <PageContents items={sections.map((s) => ({ id: s.id, heading: s.heading }))} /> : <div aria-hidden="true" />}
          <div className="flex flex-col gap-3 desktop:gap-4">
            <h1 className="sr-only desktop:hidden">{title}</h1>
            {updated && <p className="mx-0.5 text-sm font-semibold text-slate-500 desktop:hidden">{updated}</p>}
            {lead && <div className={`${BOX} rich-text px-4 py-[18px] text-[16px] leading-[1.7] text-slate-700 desktop:px-9 desktop:py-[30px]`} dangerouslySetInnerHTML={{ __html: lead }} />}
            {first && <ShortVersion section={first} />}
            {rest.length > 0 && <PrivacyDetails sections={rest} />}
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
