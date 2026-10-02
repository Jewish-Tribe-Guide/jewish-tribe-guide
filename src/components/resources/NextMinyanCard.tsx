'use client'

import type { DirectoryResource } from '@/types'
import { ClockIcon } from '@/components/icons'
import { milesText } from '@/lib/geo'
import { nextMinyansAcross, type NextMinyanLine } from '@/lib/upcomingDavening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'

// ── Synagogues' Next minyan card ─────────────────────────────────────────────
// The one thing a category page shows unasked: nearly everyone opening
// Synagogues wants the next minyan, and it changes every hour. A labelled
// card (clock, "Next minyan", times set out as facts, All davening times)
// so it can't be mistaken for a search's answer, which only ever follows a
// search. It goes as soon as anything is typed (GenericDirectory), and
// follows the list's filters: filtered to Sephardic, it names Sephardic
// shuls.
//
// Each line opens its shul. Distances are the rows' own: from the
// visitor's location, else from the community's centre.

type Props = {
  /** The shuls the list holds now, filters applied. */
  items: readonly DirectoryResource[]
  onOpenListing: (id: string) => void
  onDaveningTimes: () => void
  /** Desktop's one line under the search (the user's note 5, agreed Oct 2):
   *  beside the search box the card stood taller than it and left a gap
   *  under the box. The next minyan, and the nearest shul's when that's
   *  another shul (the earliest is often 6 miles away). */
  variant?: 'card' | 'line'
}

/** "Shacharis 6:45 AM tomorrow". */
const said = (l: NextMinyanLine) => (l.label.endsWith(' tomorrow') ? `${l.label.slice(0, -9)} ${l.time} tomorrow` : `${l.label} ${l.time}`)

export default function NextMinyanCard({ items, onOpenListing, onDaveningTimes, variant = 'card' }: Props) {
  // Null until the page has hydrated (see useNow): the card waits, keeping
  // its size, as for sunset-based times.
  const schedule = useMinyanSchedule(null, items)
  const byId = new Map(items.map((i) => [i.id, i]))
  const milesOf = (id: string) => {
    const item = byId.get(id)
    return item ? (item.milesFromAddress ?? item.milesFromCenter ?? null) : null
  }
  const lines = schedule
    ? nextMinyansAcross(
        schedule.shuls,
        { today: schedule.todayDayKeys, tomorrow: schedule.tomorrowDayKeys, nowMinutes: schedule.nowMinutes, season: schedule.season, anchors: schedule.anchors },
        milesOf,
        variant === 'line' ? Infinity : 2,
      )
    : null

  if (variant === 'line') {
    const first = lines?.[0]
    // Of every shul's next minyan, the nearest shul's.
    const nearest = lines?.reduce<NextMinyanLine | undefined>((best, l) => ((milesOf(l.shulId) ?? Infinity) < (best ? (milesOf(best.shulId) ?? Infinity) : Infinity) ? l : best), undefined)
    const far = (l: NextMinyanLine) => (milesOf(l.shulId) != null ? `, ${milesText(milesOf(l.shulId)!)}` : '')
    const shul = (l: NextMinyanLine) => (
      <button type="button" onClick={() => onOpenListing(l.shulId)} className="cursor-pointer hover:underline">
        {l.shulName}
      </button>
    )
    return (
      <section aria-labelledby="next-minyan-line-title" data-testid="next-minyan-line" className="flex min-h-12 items-center gap-3.5 rounded-xl bg-primary/[0.07] px-4 py-2.5 text-[15px]">
        <h2 id="next-minyan-line-title" className="flex shrink-0 items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          <ClockIcon className="h-3.5 w-3.5" />
          Next minyan
        </h2>
        <p className="min-w-0 flex-1 leading-snug text-ink">
          {lines === null ? (
            <span aria-hidden="true" className="inline-block h-4 w-72 animate-pulse rounded bg-slate-200 align-middle" />
          ) : !first ? (
            'Nothing listed for today or tomorrow.'
          ) : (
            <>
              <b>{said(first)}</b> · {shul(first)}
              {far(first)}
              {nearest && nearest.shulId !== first.shulId && (
                <span className="text-slate-600">
                  {' · nearest: '}
                  {said(nearest)}, {shul(nearest)}
                  {far(nearest)}
                </span>
              )}
            </>
          )}
        </p>
        <button type="button" onClick={onDaveningTimes} className="shrink-0 cursor-pointer whitespace-nowrap font-bold text-primary hover:underline">
          All by time ›
        </button>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="next-minyan-title"
      data-testid="next-minyan"
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-minyan-title" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-500">
          <ClockIcon className="h-3.5 w-3.5" />
          Next minyan
        </h2>
        <button type="button" onClick={onDaveningTimes} className="cursor-pointer whitespace-nowrap text-[13.5px] font-bold text-primary hover:underline">
          All davening times →
        </button>
      </div>
      {lines === null ? (
        // Sunset-based times (or the time itself) still arriving: the card
        // keeps its size, so the list doesn't jump when they land.
        <div aria-hidden="true" className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex h-[38px] items-center gap-2">
              <div className="h-4 w-14 animate-pulse rounded bg-slate-200" />
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : lines.length === 0 ? (
        <p className="text-[14px] text-slate-600">Nothing listed for today or tomorrow.</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line) => {
            const miles = milesOf(line.shulId)
            // Minyan times come from people, never Google: unconfirmed until
            // someone confirms them, as the shul's own row says.
            const unconfirmed = !byId.get(line.shulId)?.confirmedAt
            const second = [miles != null ? milesText(miles) : null, unconfirmed ? 'times not confirmed' : null].filter(Boolean).join(' · ')
            return (
              <li key={line.shulId}>
                <button
                  type="button"
                  onClick={() => onOpenListing(line.shulId)}
                  className="-mx-1.5 grid w-[calc(100%+0.75rem)] cursor-pointer grid-cols-[66px_minmax(0,1fr)] gap-x-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-100"
                >
                  <span className="text-[15.5px] font-extrabold text-ink">{line.time}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">
                      {line.label} · {line.shulName}
                    </span>
                    {second && <span className="block text-[13px] text-slate-500">{second}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
