import PageScreenHeader from '@/components/PageScreenHeader'
import PhotoHeader from '@/components/PhotoHeader'
import { PAGE_BOX as BOX, PAGE_COLUMN } from '@/lib/pageColumn'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { pageBodyToHtml } from '@/lib/richText'
import { firstMailto, pageDocumentParts } from '@/lib/pageSections'
import AboutHelpCards from './AboutHelpCards'
import PageContents from './PageContents'
import PrivacyDetails from './PrivacyDetails'
import ShortVersion from './ShortVersion'

type Props = {
  title: string
  /** "158 places · 14 categories": over the title on a computer, under the
   *  header on a phone. */
  eyebrow?: string | null
  /** The page row's raw body. Sanitized here; never render it any other way. */
  body: string | null | undefined
}

/** The About page, laid out as Privacy is (the user, Nov 26: two pages of
 *  the same kind shouldn't look different; boards A1 and B3, "About like
 *  Privacy"): the mission large, the first section open with its points as
 *  icon rows, the rest as boxes on a computer and rows that open on a phone,
 *  then ways to help. A computer has "On this page" beside it. Everything
 *  but the ways to help is the admin's text, laid out from its shape
 *  (pageSections.ts). */
export default function AboutDocument({ title, eyebrow, body }: Props) {
  const html = pageBodyToHtml(body)
  const { lead, sections } = pageDocumentParts(html)
  const [first, ...rest] = sections
  const contents = sections.length > 1 ? [...sections.map((s) => ({ id: s.id, heading: s.heading })), { id: 'ways-to-help', heading: 'Ways to help' }] : null

  return (
    <main className={`${PAGE_COLUMN} pt-4 ${TAB_BAR_CLEARANCE} desktop:pb-12 desktop:pt-8`}>
      <PageScreenHeader title={title} />
      <PhotoHeader eyebrow={eyebrow} title={title}>
        <div data-testid="page-document" className="mb-4 desktop:mb-0 desktop:grid desktop:grid-cols-[240px_minmax(0,760px)] desktop:items-start desktop:gap-10 desktop:pt-3">
          {contents ? <PageContents items={contents} /> : <div aria-hidden="true" />}
          <div className="flex flex-col gap-3 desktop:gap-4">
            <h1 className="sr-only desktop:hidden">{title}</h1>
            {eyebrow && <p className="mx-0.5 text-sm font-semibold text-slate-500 desktop:hidden">{eyebrow}</p>}
            {/* Text with no headings at all is no mission line, so it reads
                as a plain box. */}
            {lead && sections.length === 0 && (
              <div
                data-testid="page-plain"
                className={`${BOX} rich-text px-4 py-[18px] text-[1rem] leading-[1.7] text-slate-700 desktop:px-9 desktop:py-[30px] desktop:text-[1.0625rem]`}
                dangerouslySetInnerHTML={{ __html: lead }}
              />
            )}
            {lead && sections.length > 0 && (
              <div
                data-testid="page-lead"
                className="rich-text mx-0.5 mb-1 text-[1.375rem] font-bold leading-[1.35] tracking-tight text-slate-900 desktop:mx-0 desktop:text-[1.75rem]"
                dangerouslySetInnerHTML={{ __html: lead }}
              />
            )}
            {first && <ShortVersion section={first} />}
            {rest.length > 0 && <PrivacyDetails sections={rest} label="More about the guide" />}
            <AboutHelpCards email={firstMailto(html)} />
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
