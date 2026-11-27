import PageScreenHeader from '@/components/PageScreenHeader'
import PhotoHeader from '@/components/PhotoHeader'
import { PAGE_BOX as BOX, PAGE_COLUMN } from '@/lib/pageColumn'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { pageBodyToHtml } from '@/lib/richText'
import { pageDocumentParts } from '@/lib/pageSections'
import PageContents from './PageContents'
import PrivacyDetails from './PrivacyDetails'
import ShortVersion from './ShortVersion'

type Props = {
  title: string
  /** "Updated November 15, 2026". */
  updated?: string | null
  /** The page row's raw body. Sanitized here; never render it any other way. */
  body: string | null | undefined
}

/** The Privacy and terms page (board "Privacy and terms", the user, Nov 15):
 *  the short version first, then the details. A computer has a contents
 *  list beside them; a phone has them as rows that open. All of it is the
 *  admin's text, laid out from its shape (pageSections.ts). */
export default function PrivacyDocument({ title, updated, body }: Props) {
  const { lead, sections } = pageDocumentParts(pageBodyToHtml(body))
  const [first, ...rest] = sections

  return (
    <main className={`${PAGE_COLUMN} pt-4 ${TAB_BAR_CLEARANCE} desktop:pb-12 desktop:pt-8`}>
      <PageScreenHeader title={title} />
      <PhotoHeader eyebrow={updated} title={title}>
        <div data-testid="page-document" className="mb-4 desktop:mb-0 desktop:grid desktop:grid-cols-[240px_minmax(0,760px)] desktop:items-start desktop:gap-10 desktop:pt-3">
          {sections.length > 1 ? <PageContents items={sections.map((s) => ({ id: s.id, heading: s.heading }))} /> : <div aria-hidden="true" />}
          <div className="flex flex-col gap-3 desktop:gap-4">
            <h1 className="sr-only desktop:hidden">{title}</h1>
            {updated && <p className="mx-0.5 text-sm font-semibold text-slate-500 desktop:hidden">{updated}</p>}
            {lead && <div className={`${BOX} rich-text px-4 py-[18px] text-[1rem] leading-[1.7] text-slate-700 desktop:px-9 desktop:py-[30px]`} dangerouslySetInnerHTML={{ __html: lead }} />}
            {first && <ShortVersion section={first} />}
            {rest.length > 0 && <PrivacyDetails sections={rest} />}
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
