'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { CategoryGlyph } from '@/lib/categoryIcons'

/** One toggleable filter (a category, or the "Hospitals" pseudo-category). */
export type FilterOption = {
  id: string
  label: string
  icon?: string
  /** The pin color, mirrored on the chip so the legend reads as a legend. */
  color: string
  /** How many points this filter currently contributes. */
  count: number
}

type Props = {
  options: FilterOption[]
  /** Currently-shown ids. */
  selected: Set<string>
  onToggle: (id: string) => void
  onAll: () => void
  /** When set, only this many category chips render before a trailing
   *  "More" chip that hands off to `onMore` — the compact Google-Maps-style
   *  quick row mobile uses over the map. Omit to show every chip inline
   *  (desktop, and the full picker `onMore` opens). */
  maxVisible?: number
  onMore?: () => void
  /** Wraps chips onto multiple lines instead of a single horizontal-scroll
   *  row — used by the full-screen category picker `onMore` opens, which has
   *  the vertical room a single row over the map doesn't. */
  wrap?: boolean
  /** Rendered first, before "All": the map's Filters button, which opens
   *  one sheet for every category showing (MapFiltersSheet). The chips
   *  themselves only choose categories; filtering a category is that
   *  sheet's job (agreed Sep 30, the category pages' own format). */
  leadingChip?: ReactNode
  /** A live seasonal campaign's category (see CampaignBannerManager) — same
   *  reasoning and same slot as `pinnedChip` below (a fully-rendered node,
   *  not a `FilterOption`, since it needs its own distinct styling rather
   *  than the plain on/off treatment every regular chip gets), but rendered
   *  first: a time-limited promotion outranks the visitor's own Pinned
   *  shortlist while it's live. Absent entirely outside the campaign's date
   *  range — see activeCampaignBanner. */
  campaignChip?: React.ReactNode
  /** The "Pinned" shortlist toggle — not one of `options`, so it can't just
   *  be another entry in that array: it narrows ACROSS categories rather
   *  than being one, and it's the single most important chip in the row, so
   *  it renders right after the "All" chip rather than sorted in among the
   *  regular category chips by count like everything else here. */
  pinnedChip?: React.ReactNode
  /** Whether the Pinned chip (above) is currently on — folded into "is
   *  everything on" below (only while `pinnedChip` is actually rendered, so
   *  its absence — nothing pinned yet — can't read as "something's off")
   *  so the "All" chip's own highlighted state, and what tapping it does,
   *  accounts for Pinned too, not just the real categories. */
  pinnedOn?: boolean
  /** Bumped by the parent each time the full-screen category picker (the
   *  compact row's own "More" chip opens it) closes — the only thing,
   *  besides first mount or the category list itself changing, that
   *  reorders this row. See the `order` state below for why an ordinary tap
   *  on a chip already in the row must NOT do the same. */
  resortToken?: number
  /** Desktop only: round buttons pinned at the row's left/right edges that
   *  scroll it — replacing the browser's native (and here invisible, since
   *  `chip-scroll` hides the scrollbar) horizontal-scroll affordance with
   *  something a visitor can actually see and click. Each side's button
   *  only shows once there's actually somewhere left to scroll TO on that
   *  side — hidden at the very start (nothing to scroll back to) and the
   *  very end (nothing left to scroll forward to), the same pattern most
   *  carousel components use. Both are absolutely positioned OVER the row
   *  rather than flex siblings beside it, so showing/hiding either one can
   *  never change the row's own layout width — which is what makes toggling
   *  them safe: an earlier version reserved the right button's space as a
   *  flex sibling instead, and mounting/unmounting it changed the row's own
   *  width, which is exactly what decided whether to mount it — a feedback
   *  loop that visually shook (see CategoryFilter.test.tsx's own note).
   *  Not meaningful together with `wrap` (the full-screen picker's own
   *  multi-line layout has no scroll to reveal). */
  scrollArrow?: boolean
}

/** The filter bar above the map: a chip per category that doubles as the color
 *  legend, plus an "All" shortcut. There's no "hide everything" state to
 *  toggle back to — unclicking the last chip resets to all (see `toggle` in
 *  ResourceMapView) — so this is a one-way reset, not a Show all/Hide all
 *  pair. A single horizontal-scroll row (native scrollbar, styled thin via
 *  the `chip-scroll` class in globals.css) rather than wrapping, so it stays
 *  compact over the map. */
export default function CategoryFilter({
  options,
  selected,
  onToggle,
  onAll,
  maxVisible,
  onMore,
  wrap,
  leadingChip,
  campaignChip,
  pinnedChip,
  pinnedOn,
  resortToken,
  scrollArrow,
}: Props) {
  const allOn = options.every((o) => selected.has(o.id)) && (!pinnedChip || !!pinnedOn)

  // The compact row's own display order — deliberately NOT re-derived from
  // `selected` on every render/tap. Once a visitor has scanned this row
  // they've built a spatial map of it ("grocery is third"), and reordering
  // out from under an ordinary tap breaks that memory and can land a fast
  // second tap on whatever slid into its spot — so tapping a chip in place
  // never moves it, only its on/off color changes.
  //
  // It's only worth recomputing when there's no "spot" to preserve: on
  // mount, when the category list itself changes, or when `resortToken`
  // bumps (the parent does this when the full-screen picker closes) — a
  // visitor who's been off this screen entirely, picking from a plain
  // top-down checklist, has no row layout to remember. Selected categories
  // then lead (in their existing highest-to-lowest-count order — `options`
  // already arrives sorted that way, see ResourceMapView), unselected ones
  // follow, same highest-to-lowest; with everything selected that's a
  // no-op, so this is also just the plain default order. `Array.sort` is
  // guaranteed stable (ES2019+), so each group keeps its own relative order
  // rather than a comparator returning 0 leaving it to chance.
  //
  // Only matters when `maxVisible` truncates the row — the full/wrap picker
  // (`maxVisible` unset) already shows every chip, so there's nothing to
  // reorder and `order` stays unused.
  //
  // Seeded with the same selected-first sort the resort effect below
  // computes, not `null` — `lastResortKey` (below) initializes to the same
  // value as the first render's `resortKey`, so that effect's `!==` check
  // is trivially false on mount and never fires there. Starting `order` at
  // `null` meant the very first paint fell back to `options`' plain
  // default order regardless of `selected` — so a category arrived at via
  // a deep link (e.g. the map's own `?cat=` URL param) could render behind
  // "⋯ More" with no indication anything was even selected, until some
  // later change (category list changing, or `resortToken` bumping)
  // happened to trigger a resort.
  const [order, setOrder] = useState<string[] | null>(() =>
    maxVisible != null
      ? [...options].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).map((o) => o.id)
      : null,
  )
  const optionIds = options.map((o) => o.id).join(',')
  // React's own documented pattern for "recompute state when a prop
  // changes" — compared and (conditionally) set DURING render, not in a
  // `useEffect`. An effect here would run as a side effect after the row
  // already painted with the stale order, and its only reason to re-fire
  // would be `resortToken`/`optionIds` ticking — a value that exists purely
  // to trigger it, which is exactly the "you might not need an effect"
  // anti-pattern React's lint rule for this flags. Comparing here instead
  // recomputes synchronously, before that stale paint would ever happen.
  const resortKey = `${optionIds}:${resortToken ?? ''}`
  const [lastResortKey, setLastResortKey] = useState(resortKey)
  if (maxVisible != null && resortKey !== lastResortKey) {
    setLastResortKey(resortKey)
    // Deliberately NOT keyed on `selected` (see above) — only mount, the
    // category list changing, or resortToken bumping should reorder.
    setOrder([...options].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).map((o) => o.id))
  }

  const visible =
    maxVisible != null
      ? (order ?? options.map((o) => o.id))
          .map((id) => options.find((o) => o.id === id))
          .filter((o): o is FilterOption => !!o)
          .slice(0, maxVisible)
      : options
  const hiddenCount = maxVisible != null ? Math.max(0, options.length - maxVisible) : 0

  // `scrollArrow`'s own row ref, plus which of the two edge buttons are
  // currently worth showing — recomputed on scroll (the row itself moving)
  // and on resize (the row's own width, or its content, changing). Starts
  // both false: the true starting state is measured on mount, in the effect
  // below, before anything has necessarily painted with a wrong guess.
  const scrollRowRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  useEffect(() => {
    if (!scrollArrow) return
    const el = scrollRowRef.current
    if (!el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 1)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [scrollArrow, optionIds])

  const scrollByDirection = (dir: 1 | -1) => {
    const el = scrollRowRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const row = (
    <div
      ref={scrollArrow ? scrollRowRef : undefined}
      className={
        wrap
          ? 'flex flex-wrap items-center gap-1.5'
          // Padding reserved on BOTH sides unconditionally, regardless of
          // canScrollLeft/canScrollRight — same reasoning as the buttons
          // themselves being absolutely positioned: if this padding came
          // and went with the buttons' own visibility, the row's width (and
          // therefore its own scroll bounds) would change depending on
          // state, which is exactly the kind of self-referential loop that
          // caused the shaking bug this file's tests document.
          : `chip-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 ${scrollArrow ? 'pl-9 pr-9' : ''}`
      }
    >
      {/* Always resets to everything — there's no "hide everything" state
          left to toggle to (unclicking the last chip already resets here,
          see `toggle` in ResourceMapView), so this reads as a single "All"
          chip, filled to match whenever it's already the active state,
          rather than a Show all/Hide all pair. */}
      {leadingChip}
      <button
        onClick={onAll}
        aria-pressed={allOn}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
          allOn
            ? 'border-transparent bg-slate-700 text-white'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
        }`}
      >
        All
      </button>
      {campaignChip}
      {pinnedChip}
      {visible.map((o) => {
        const selectedState = selected.has(o.id)
        // Display only — while "All" is active every category is technically
        // selected, but coloring in the whole row just to say "everything's
        // on" is redundant with the map itself already showing everything;
        // the "All" chip alone carries that signal. A real, functional
        // selection (aria-pressed, openEditor below) still uses
        // `selectedState`, not this — only the paint job differs.
        const on = selectedState && !allOn
        return (
          <div key={o.id} className="relative shrink-0">
            <div
              className={`flex items-stretch rounded-full border text-xs font-medium transition-colors ${
                on ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-500'
              }`}
              style={on ? { backgroundColor: o.color } : undefined}
            >
              <button
                onClick={() => onToggle(o.id)}
                aria-pressed={selectedState}
                className={`flex items-center gap-1 py-1 pl-2.5 pr-2.5 ${
                  on ? 'rounded-full' : 'rounded-full hover:bg-slate-50'
                } cursor-pointer`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full ring-1 ring-white/60"
                  style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : o.color }}
                  aria-hidden="true"
                />
                {o.icon && <CategoryGlyph categoryId={o.id} icon={o.icon} className="h-3 w-3 shrink-0" />}
                <span>{o.label}</span>
                {/* How many of this category the filters leave: 73, or 5
                    with Meat, Keystone-K and Open now on. */}
                <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
              </button>
            </div>

          </div>
        )
      })}
      {hiddenCount > 0 && (
        <button
          onClick={onMore}
          className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          ⋯ More
        </button>
      )}
    </div>
  )

  if (!scrollArrow) return row

  // Each button is absolutely positioned OVER the row rather than a flex
  // sibling beside it (matching Google Maps' own right-edge button exactly —
  // verified live: `position: absolute; right: 0; width/height: 32px;
  // border-radius: 16px`) — an overlay can never change the row's own
  // layout width, which is what makes conditionally showing/hiding either
  // one safe: an earlier version reserved the right button's space as a
  // flex sibling instead, and mounting/unmounting it changed the row's own
  // width, which is exactly what decided whether to mount it — a feedback
  // loop that visually shook (see CategoryFilter.test.tsx's own note).
  return (
    <div className="relative">
      {row}
      {canScrollLeft && (
        <button
          onClick={() => scrollByDirection(-1)}
          aria-label="Show earlier categories"
          className="absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 cursor-pointer"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scrollByDirection(1)}
          aria-label="Show more categories"
          className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 cursor-pointer"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
