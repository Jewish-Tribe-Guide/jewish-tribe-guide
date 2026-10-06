import type { ReactNode } from 'react'
import { community } from '@/community.config'

// Small pieces an opened listing's sections share (ListingView, DaveningCard).

/** One of an opened listing's boxes (Oct 6): white on the listing's grey,
 *  a title when what's in it needs naming ("Main dishes", "Women’s"), none
 *  when its icons or its words say what it is (the contact box, the
 *  description), and a dated line under it when it has one. */
export function Card({ title, children, footer, testId, action }: { title?: string; children: ReactNode; footer?: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white px-4 pb-3 ${title ? 'pt-3.5' : 'pt-1'}`} data-testid={testId}>
      {title &&
        (action ? (
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
            {action}
          </div>
        ) : (
          <h2 className="mb-1 text-base font-extrabold text-slate-900">{title}</h2>
        ))}
      {children}
      {footer && <div className="mt-2.5 border-t border-slate-100 pt-2 text-[13px] leading-snug text-muted">{footer}</div>}
    </section>
  )
}

/** "Sep 30", in the community's own timezone, so the server and the
 *  browser always agree (a date near midnight read in two timezones is two
 *  dates, and a mismatch React redoes the page for). With the year once it's
 *  most of a year ago, which needs the visitor's clock: `now`, from useNow,
 *  null until the page has hydrated. */
export function shortDate(iso: string, now: number | null = null): string {
  const d = new Date(iso)
  const old = now !== null && now - d.getTime() > 300 * 86_400_000
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(old ? { year: 'numeric' } : {}), timeZone: community.timezone })
}
