'use client'

import type { ReactNode } from 'react'
import { ClockIcon } from '@/components/icons'
import { FilterChip } from './FiltersSheet'

// ── The list's own heading: what it is, how many, and how it's arranged ─────
// "57 listings   Filters  Sort Popularity ▾". Above the list is for asking
// (the search box, CategoryAsk); this heading is for arranging, the same
// place on every category page: Filters, which opens the one sheet holding
// every filter (FiltersSheet), and Sort.
//
// Under it, a line of the filters that are on, as filled chips a tap
// switches off, so a filter set from a listing's own badge deep in the list
// is never on unseen. Once something is typed, Open now leads that line as
// a switch, on or off: the one refinement people reach for after asking,
// without opening the sheet. It sits on that line rather than beside Filters
// and Sort because there isn't room for all three on a phone.

type Props = {
  /** The first group's name, or what closed groups are grouped by ("By
   *  denomination"); none for one ungrouped list. */
  label?: string
  /** The number beside it: the first group's, or the whole list's. */
  count: number
  /** "14 listings" rather than a bare "14": for the whole list, not a group. */
  noun?: boolean
  /** How many the whole list holds, whatever the heading shows. */
  total: number
  /** Open now as a switch leading the chip line, for after a search. */
  openNow?: { on: boolean; onToggle: () => void }
  /** Filters, with how many are on; absent where the category keeps none. */
  filters?: { active: number; onOpen: () => void }
  /** Sort, where there's more than one way to (likes on). */
  sort?: { byPopular: boolean; onSelect: (byPopular: boolean) => void }
  onDaveningTimes?: () => void
  externalLink?: { url: string; label: string }
  /** The filters switched on, each switched off by a tap. */
  activeChips: { id: string; label: string; onOff: () => void }[]
}

export default function ListHeading({ label, count, noun = !label, total, openNow, filters, sort, onDaveningTimes, externalLink, activeChips }: Props) {
  const countText = noun ? `${count} listing${count === 1 ? '' : 's'}` : String(count)
  return (
    <div data-testid="list-heading" data-total={total} className="space-y-2 pt-2">
      {/* Wraps rather than running off the side of a narrow phone. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3">
        <h2 className="shrink-0 text-[15px] font-bold text-ink">
          {label ? (
            <>
              {label} <span className="font-medium text-slate-500">· {countText}</span>
            </>
          ) : (
            countText
          )}
        </h2>
        <div className="ml-auto flex items-center gap-3.5">
          {externalLink && (
            <TextAction>
              <a href={externalLink.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap">
                {externalLink.label} ↗
              </a>
            </TextAction>
          )}
          {onDaveningTimes && (
            <TextAction>
              <button type="button" onClick={onDaveningTimes} aria-label="All davening times" className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
                <ClockIcon className="h-4 w-4" />
                {/* The words once there's room; the clock alone on the
                    narrowest phones, so Filters never gets crowded out. */}
                <span className="hidden min-[390px]:inline">All davening times</span>
              </button>
            </TextAction>
          )}
          {filters && (
            <TextAction>
              <button type="button" onClick={filters.onOpen} aria-haspopup="dialog" className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5">
                  <path d="M20 7h-9" />
                  <path d="M14 17H5" />
                  <circle cx="17" cy="17" r="3" />
                  <circle cx="7" cy="7" r="3" />
                </svg>
                Filters
                {filters.active > 0 && (
                  <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                    {filters.active}
                  </span>
                )}
              </button>
            </TextAction>
          )}
          {sort && (
            <label className="flex shrink-0 items-center gap-1 text-[13.5px] text-slate-500">
              Sort
              <span className="relative flex items-center">
                {/* A native select: the phone's own picker, and a keyboard
                    that works without anything written for it. Choosing
                    Distance with nowhere to measure from asks for a location
                    instead (selectSort in GenericDirectory), and this stays
                    on Popularity until one is set. */}
                <select
                  aria-label="Sort"
                  value={sort.byPopular ? 'popular' : 'distance'}
                  onChange={(e) => sort.onSelect(e.target.value === 'popular')}
                  className="cursor-pointer appearance-none bg-transparent py-1.5 pr-4 font-bold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <option value="popular">Popularity</option>
                  <option value="distance">Distance</option>
                </select>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-primary">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </label>
          )}
        </div>
      </div>
      {(openNow || activeChips.length > 0) && (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 desktop:mx-0 desktop:flex-wrap desktop:px-0" style={{ scrollbarWidth: 'none' }} data-testid="active-filters">
          {openNow && <FilterChip label="Open now" on={openNow.on} onToggle={openNow.onToggle} dot />}
          {activeChips.map((c) => (
            <FilterChip key={c.id} label={c.label} on onToggle={c.onOff} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Each open group after the first, whose heading is the list's own:
 *  "Not open now · 16". */
export function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="pb-2 pt-6 text-[15px] font-bold text-ink">
      {label} <span className="font-medium text-slate-500">· {count}</span>
    </h2>
  )
}

/** A closed group: one line, the same size for every group whatever it
 *  holds, with its count and nearest place. A tap opens it. */
export function ClosedGroupLine({
  label,
  count,
  nearest,
  open,
  onToggle,
  controls,
}: {
  label: string
  count: number
  nearest?: string
  open: boolean
  onToggle: () => void
  /** The id of the rows it opens. */
  controls: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[15.5px] font-bold ${open ? 'text-primary' : 'text-ink'}`}>
          {label} <span className="font-medium text-slate-500">· {count}</span>
        </span>
        {/* Open, its rows say it themselves. */}
        {nearest && !open && <span className="mt-0.5 block truncate text-[13px] text-slate-500">Nearest: {nearest}</span>}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-[18px] w-[18px] shrink-0 transition-transform ${open ? 'rotate-90 text-primary' : 'text-slate-500'}`}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

function TextAction({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center py-1.5 text-[13.5px] font-bold text-primary">{children}</span>
}
