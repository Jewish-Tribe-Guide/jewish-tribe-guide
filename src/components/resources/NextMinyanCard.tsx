'use client'

import type { DirectoryResource } from '@/types'
import { ClockIcon } from '@/components/icons'
import { roundMiles } from '@/lib/geo'
import { nextMinyansAcross } from '@/lib/upcomingDavening'
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
}

export default function NextMinyanCard({ items, onOpenListing, onDaveningTimes }: Props) {
  const { shuls, anchors, todayDayKeys, tomorrowKey, nowMinutes, season } = useMinyanSchedule(null, items)
  const byId = new Map(items.map((i) => [i.id, i]))
  const milesOf = (id: string) => {
    const item = byId.get(id)
    return item ? (item.milesFromAddress ?? item.milesFromCenter ?? null) : null
  }
  const lines = nextMinyansAcross(shuls, { today: todayDayKeys, tomorrow: [tomorrowKey], nowMinutes, season, anchors }, milesOf)

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
        // Sunset-based times still arriving: the card keeps its size, so
        // the list doesn't jump when they land.
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
            const second = [miles != null ? `${roundMiles(miles)} mi` : null, unconfirmed ? 'times not confirmed' : null].filter(Boolean).join(' · ')
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
