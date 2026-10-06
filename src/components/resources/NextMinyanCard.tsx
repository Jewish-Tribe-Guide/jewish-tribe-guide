'use client'

import type { DirectoryResource } from '@/types'
import { ChevronRightIcon, ClockIcon } from '@/components/icons'
import { milesText } from '@/lib/geo'
import { nextMinyansAcross, type NextMinyanLine } from '@/lib/upcomingDavening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'

// ── Synagogues' way in to every minyan ───────────────────────────────────────
// One row, "Minyanim by time", with the next minyan under it (Oct 6, the
// user's pick of three): it answers "where can I daven soon?" without a tap,
// and the whole row opens the Minyanim view. It replaced a Synagogues /
// Minyanim toggle and a Next minyan card with its own small link: two doors
// to the same list, and the link was hard to hit under the card's text.
// A row you tap like the site's others: its chevron points right, to a new
// page, where a group's points down, opening in place.
//
// It goes as soon as anything is typed (GenericDirectory), and follows the
// list's filters: filtered to Sephardic, it names a Sephardic shul.
// Distances are the rows' own: from the visitor's location, else from the
// community's centre.

type Props = {
  /** The shuls the list holds now, filters applied. */
  items: readonly DirectoryResource[]
  onDaveningTimes: () => void
}

/** From 3 PM on a Friday, Friday's minyanim are Friday night's. */
const FRIDAY_NIGHT = 15 * 60

/** "Next 6:19 PM", "Next 6:45 AM tomorrow", "Friday night 5:30 PM". */
export function nextWords(line: NextMinyanLine, friday: boolean): string {
  if (line.tomorrow) return `Next ${line.time} tomorrow`
  return friday && line.minutes >= FRIDAY_NIGHT ? `Friday night ${line.time}` : `Next ${line.time}`
}

/** Within this many minutes of the soonest, the nearest shul's is named:
 *  Sons of Israel's 6:19 PM in Cherry Hill, 8 miles out, isn't the answer
 *  over Mekor Habracha's 6:20 PM a few blocks away. */
export const NEARLY_AS_SOON = 15

/** The minyan to name: of those starting within NEARLY_AS_SOON minutes of
 *  the soonest (on the same day), the nearest shul's; on the same distance,
 *  the sooner. Null when nothing's listed today or tomorrow. */
export function pickNext(lines: readonly NextMinyanLine[], milesOf: (id: string) => number | null): NextMinyanLine | null {
  const first = lines[0]
  if (!first) return null
  const close = lines.filter((l) => l.tomorrow === first.tomorrow && l.minutes - first.minutes <= NEARLY_AS_SOON)
  const miles = (l: NextMinyanLine) => milesOf(l.shulId) ?? Infinity
  return close.reduce((best, l) => (miles(l) < miles(best) ? l : best), first)
}

export default function NextMinyanCard({ items, onDaveningTimes }: Props) {
  // Null until the page has hydrated (see useNow): the line waits, keeping
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
        Infinity,
      )
    : undefined
  const next = lines === undefined || lines === null ? lines : pickNext(lines, milesOf)
  const loading = schedule === null || next === undefined
  const friday = !!schedule?.todayDayKeys.includes('fri')
  const miles = next ? milesOf(next.shulId) : null

  // Ringed in green (Oct 6): the one row on the page that goes somewhere,
  // so it doesn't read as one more of the denomination dropdowns under it.
  return (
    <button
      type="button"
      onClick={onDaveningTimes}
      data-testid="next-minyan"
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-emerald-600 bg-white px-3.5 py-3 text-left transition-colors hover:bg-emerald-50"
    >
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <ClockIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-ink">Minyanim by time</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-slate-700">
          {loading ? (
            <span aria-hidden="true" className="inline-block h-4 w-48 animate-pulse rounded bg-slate-200 align-middle" />
          ) : next ? (
            <>
              <b className="font-bold text-emerald-700">{nextWords(next, friday)}</b> · {next.shulName}
              {miles != null && `, ${milesText(miles)}`}
            </>
          ) : (
            'Nothing listed for today or tomorrow'
          )}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-emerald-700" />
    </button>
  )
}
