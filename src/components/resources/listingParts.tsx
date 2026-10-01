import type { ReactNode } from 'react'
import { community } from '@/community.config'

// Small pieces an opened listing's sections share (ListingView, DaveningCard).

/** A main-thing card: a title, its content, and a dated line under it. */
export function Card({ title, children, footer, testId, action }: { title: string; children: ReactNode; footer?: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 pt-3.5 pb-3" data-testid={testId}>
      {action ? (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
          {action}
        </div>
      ) : (
        <h2 className="mb-1 text-base font-extrabold text-slate-900">{title}</h2>
      )}
      {children}
      {footer && <div className="mt-2.5 border-t border-slate-200 pt-2 text-[13px] leading-snug text-muted">{footer}</div>}
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
