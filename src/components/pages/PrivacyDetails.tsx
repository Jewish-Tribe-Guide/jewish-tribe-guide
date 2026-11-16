'use client'

import { useState } from 'react'
import type { PageSection } from '@/lib/pageSections'
import { PageGlyph } from './PageGlyph'

/** A section's text: a list with bold leads drawn without bullets (board
 *  "Privacy and terms"), anything else as written. */
export function SectionBody({ section, className = '' }: { section: PageSection; className?: string }) {
  const p = section.points
  // Safe only because every string here came through pageBodyToHtml.
  if (!p) return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: section.html }} />
  return (
    <div className={`rich-text ${className}`}>
      {p.before && <div dangerouslySetInnerHTML={{ __html: p.before }} />}
      <ul className="!my-0 flex !list-none flex-col gap-3 !pl-0">
        {p.items.map((item) => (
          <li key={item.title} className="!my-0">
            <strong className="text-slate-900">{item.title}</strong> <span dangerouslySetInnerHTML={{ __html: item.html }} />
          </li>
        ))}
      </ul>
      {p.after && <div className="mt-3" dangerouslySetInnerHTML={{ __html: p.after }} />}
    </div>
  )
}

/** Privacy's sections after the short version. On a computer each is its
 *  own white box, all open, reached from the contents list. On a phone they
 *  are rows in one box that open one at a time, so the short version and the
 *  list of what's covered fit on a screen. The text is always in the page
 *  (a closed row is only hidden below the desktop size, by
 *  `.page-row-closed` in globals.css), so search engines and Find in page
 *  still see all of it. */
export default function PrivacyDetails({ sections }: { sections: PageSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <>
      <p className="mx-1 mt-2 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-500 desktop:hidden">The details</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05)] desktop:flex desktop:flex-col desktop:gap-4 desktop:overflow-visible desktop:rounded-none desktop:border-0 desktop:bg-transparent desktop:shadow-none">
        {sections.map((s) => {
          const open = openId === s.id
          return (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-h`}
              className="border-t border-slate-200 first:border-t-0 desktop:scroll-mt-24 desktop:rounded-2xl desktop:border desktop:bg-white desktop:px-9 desktop:py-[30px] desktop:shadow-[0_1px_2px_rgb(15_23_42/0.05)] desktop:first:border-t"
            >
              <h2 id={`${s.id}-h`} className="text-[16.5px] text-slate-900 desktop:mb-3.5 desktop:text-[19px] desktop:font-bold">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`${s.id}-body`}
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left desktop:hidden"
                >
                  <span className={`flex-1 ${open ? 'font-bold' : 'font-semibold'}`}>{s.heading}</span>
                  <PageGlyph name="chevronDown" className={`h-5 w-5 flex-none transition-transform ${open ? 'rotate-180 text-slate-500' : 'text-slate-400'}`} />
                </button>
                <span className="hidden desktop:inline">{s.heading}</span>
              </h2>
              <div id={`${s.id}-body`} className={open ? 'px-4 pb-[18px] desktop:p-0' : 'page-row-closed'}>
                <SectionBody section={s} className="text-[15.5px] leading-[1.65] text-slate-700 desktop:text-[16px] desktop:leading-[1.7]" />
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
