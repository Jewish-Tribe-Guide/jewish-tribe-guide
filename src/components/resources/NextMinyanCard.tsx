'use client'

import type { DirectoryResource } from '@/types'
import { ChevronRightIcon, ClockIcon } from '@/components/icons'
import { minyanimLeftToday } from '@/lib/minyanimFilters'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'

// ── Synagogues' way in to every minyan ───────────────────────────────────────
// One row, "Minyanim · 24 left today" (Oct 15, the user's sketch; it named
// the next minyan before), and the whole row opens the Minyanim view. It
// replaced a Synagogues / Minyanim toggle (Oct 6). A row you tap like the
// site's others: its chevron points right, to a new page.
//
// It goes as soon as anything is typed (GenericDirectory), and follows the
// list's filters: filtered to Sephardic, it counts Sephardic shuls'
// minyanim, the same number the view's heading shows.

type Props = {
  /** The shuls the list holds now, filters applied. */
  items: readonly DirectoryResource[]
  onDaveningTimes: () => void
}

export default function NextMinyanCard({ items, onDaveningTimes }: Props) {
  // Null until the page has hydrated (see useNow): the line waits, keeping
  // its size, as for sunset-based times.
  const schedule = useMinyanSchedule(null, items)
  const left = schedule ? minyanimLeftToday(schedule) : 0

  // Ringed in green (Oct 6): the one row on the page that goes somewhere,
  // not one more shul.
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
      {/* How many are left today, as the Minyanim view's own heading counts
          them (the user, Oct 15: the sketch's "Minyanim · 24 left today"),
          with what's behind it under that. */}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-ink" data-testid="minyanim-left">
          Minyanim
          {schedule && <span className="text-emerald-700"> · {left === 0 ? 'none left today' : `${left} left today`}</span>}
        </span>
        <span className="mt-0.5 block text-[14px] leading-snug text-slate-700">Every minyan by time, any day this week</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-emerald-700" />
    </button>
  )
}
