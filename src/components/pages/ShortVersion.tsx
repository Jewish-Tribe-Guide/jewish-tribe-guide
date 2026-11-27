import { PAGE_BOX as BOX } from '@/lib/pageColumn'
import { pointGlyph, type PageSection } from '@/lib/pageSections'
import { GlyphDot } from './PageGlyph'
import { SectionBody } from './PrivacyDetails'

/** A page's first section, always open: the page in short (Privacy's "The
 *  short version", About's "What sets it apart"). Named points are rows with
 *  an icon; anything else is its text. */
export default function ShortVersion({ section }: { section: PageSection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className={`${BOX} px-4 py-[18px] desktop:scroll-mt-24 desktop:px-9 desktop:py-[30px]`}>
      <h2 id={`${section.id}-h`} className="mb-4 text-[1.1875rem] font-bold text-slate-900">{section.heading}</h2>
      {section.points && !section.points.before && !section.points.after ? (
        <ul className="flex flex-col gap-3.5 text-[0.96875rem] leading-[1.5] text-slate-700 desktop:gap-4 desktop:text-[1rem]">
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
        <SectionBody section={section} className="text-[1rem] leading-[1.7] text-slate-700" />
      )}
    </section>
  )
}
