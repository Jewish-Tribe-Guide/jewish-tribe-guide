import PageScreenHeader from '@/components/PageScreenHeader'
import PhotoHeader from '@/components/PhotoHeader'
import { PAGE_BOX, PAGE_COLUMN } from '@/lib/pageColumn'
import { TAB_BAR_CLEARANCE } from '@/lib/tabBarClearance'
import { pageBodyToHtml } from '@/lib/richText'
import { aboutBlocks, firstMailto, pageDocumentParts, pointGlyph, type PageSection } from '@/lib/pageSections'
import { GlyphDot } from './PageGlyph'
import AboutHelpCards from './AboutHelpCards'

type Props = {
  title: string
  /** "158 places · 14 categories": over the title on a computer, under the
   *  header on a phone. */
  eyebrow?: string | null
  /** The page row's raw body. Sanitized here; never render it any other way. */
  body: string | null | undefined
}

const BOX = PAGE_BOX
const H2 = 'text-[1.25rem] font-extrabold tracking-tight text-slate-900 desktop:text-[1.5rem]'
// Fixed strings, so Tailwind sees every one.
const CARD_COLUMNS: Record<number, string> = {
  1: 'desktop:grid-cols-1',
  2: 'desktop:grid-cols-2',
  3: 'desktop:grid-cols-3',
  4: 'desktop:grid-cols-4',
}

/** A plain section in a white box. Beside a partner its heading is a small
 *  label ("THE PROBLEM", board About v2); on its own, a title. */
function ProseBox({ section, label }: { section: PageSection; label: boolean }) {
  return (
    <section aria-labelledby={section.id} className={`${BOX} min-w-0 px-4 py-[18px] desktop:px-8 desktop:py-[30px]`}>
      <h2
        id={section.id}
        className={label
          ? 'mb-2.5 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-slate-500'
          : 'mb-3 text-[1.1875rem] font-bold text-slate-900'}
      >
        {section.heading}
      </h2>
      {/* Safe only because the body went through pageBodyToHtml. */}
      <div className="rich-text text-[1rem] leading-[1.7] text-slate-700 desktop:text-[1.0625rem]" dangerouslySetInnerHTML={{ __html: section.html }} />
    </section>
  )
}

/** Named points as cards: a row of them on a computer; on a phone, rows in
 *  one box, so four of them don't make a long scroll. */
function Cards({ section }: { section: PageSection }) {
  const items = section.points!.items
  return (
    <section aria-labelledby={section.id} className="flex flex-col gap-3 desktop:gap-[18px]">
      <h2 id={section.id} className={`${H2} mx-1 mt-3 desktop:mx-0 desktop:mt-0`}>{section.heading}</h2>
      <ul className={`${BOX} flex flex-col gap-4 px-4 py-[18px] desktop:grid desktop:gap-4 desktop:border-0 desktop:bg-transparent desktop:p-0 desktop:shadow-none ${CARD_COLUMNS[Math.min(items.length, 4)]}`}>
        {items.map((item) => (
          <li
            key={item.title}
            className="flex gap-3.5 desktop:flex-col desktop:gap-2.5 desktop:rounded-2xl desktop:border desktop:border-slate-200 desktop:bg-white desktop:p-[22px] desktop:pb-6 desktop:shadow-[0_1px_2px_rgb(15_23_42/0.05)]"
          >
            <GlyphDot name={pointGlyph(item.title)} large />
            <div className="min-w-0 text-[0.96875rem] leading-[1.5] text-slate-700 desktop:leading-[1.6]">
              <h3 className="font-bold text-slate-900 desktop:mb-2.5 desktop:text-[1.0625rem]">{item.title}</h3>
              <div className="rich-text" dangerouslySetInnerHTML={{ __html: item.html }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The About page (board "About v2", the user, Nov 15): the mission large,
 *  then the page's own sections laid out from their shape (pageSections.ts),
 *  then ways to help. Everything but the ways to help is the admin's text. */
export default function AboutDocument({ title, eyebrow, body }: Props) {
  const html = pageBodyToHtml(body)
  const { lead, sections } = pageDocumentParts(html)
  const blocks = aboutBlocks(sections)
  // A plain section at the very end ("Who runs it") sits beside the ways to
  // help on a computer, as the board has it.
  const last = blocks.at(-1)
  const beside = last?.kind === 'single' ? last.section : null
  const rows = beside ? blocks.slice(0, -1) : blocks

  return (
    <main className={`${PAGE_COLUMN} pt-4 ${TAB_BAR_CLEARANCE} desktop:pb-12 desktop:pt-8`}>
      <PageScreenHeader title={title} />
      <PhotoHeader eyebrow={eyebrow} title={title}>
        <div data-testid="page-document" className="mb-4 flex flex-col gap-3.5 desktop:mb-0 desktop:gap-12 desktop:pt-3">
          <h1 className="sr-only desktop:hidden">{title}</h1>
          {eyebrow && <p className="mx-0.5 text-sm font-semibold text-slate-500 desktop:hidden">{eyebrow}</p>}
          {/* Text with no headings at all (live's About until its new text
              goes in) is no mission line, so it reads as a plain box. */}
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
              className="rich-text mb-1.5 max-w-[860px] text-[1.5rem] font-bold leading-[1.35] tracking-tight text-slate-900 desktop:mb-0 desktop:text-[2rem]"
              dangerouslySetInnerHTML={{ __html: lead }}
            />
          )}
          {rows.map((block) =>
            block.kind === 'pair' ? (
              <div key={block.sections[0].id} className="flex flex-col gap-3.5 desktop:grid desktop:grid-cols-2 desktop:gap-5">
                <ProseBox section={block.sections[0]} label />
                <ProseBox section={block.sections[1]} label />
              </div>
            ) : block.kind === 'cards' ? (
              <Cards key={block.section.id} section={block.section} />
            ) : (
              <ProseBox key={block.section.id} section={block.section} label={false} />
            ),
          )}
          <div className="flex flex-col gap-3.5 desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-5">
            {beside && <ProseBox section={beside} label={false} />}
            <AboutHelpCards email={firstMailto(html)} />
          </div>
        </div>
      </PhotoHeader>
    </main>
  )
}
