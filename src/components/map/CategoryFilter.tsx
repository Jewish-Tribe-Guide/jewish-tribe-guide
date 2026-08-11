'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CategoryConfig } from '@/lib/categories'
import type { MapPoint } from './ResourceMap'
import CategoryFilterControls, { activeFilterEntries, categoryHasFilterableFields } from './CategoryFilterControls'
import { ChevronRightIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'

/** One toggleable filter (a category, or the "Hospitals" pseudo-category). */
export type FilterOption = {
  id: string
  label: string
  icon?: string
  /** The pin color, mirrored on the chip so the legend reads as a legend. */
  color: string
  /** How many points this filter currently contributes. */
  count: number
  /** Active bool/select filter(s) scoped to this category, already formatted
   *  for display (e.g. "Keilim", or "Catering, Keystone-K") — shown as a
   *  small badge inside the chip so an active filter is visible at a
   *  glance. Purely informational now; the chevron (see below) is what
   *  actually opens the editor, so this doesn't need its own tap target. */
  filterSuffix?: string
}

type Props = {
  options: FilterOption[]
  /** Currently-shown ids. */
  selected: Set<string>
  onToggle: (id: string) => void
  onAll: () => void
  onNone: () => void
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
  /** Real category configs, plus the current bool/select filter state and
   *  its setters — needed to power the inline filter editor a chip's own
   *  chevron opens. */
  categories: CategoryConfig[]
  /** Every plottable point — needed by the inline filter editor to compute
   *  which select-field values actually occur within a category (same as
   *  the full-screen picker's own expanded row uses). */
  points: MapPoint[]
  boolFields: string[]
  onToggleBool: (categoryId: string, key: string) => void
  selectFilters: Record<string, string[]>
  onToggleSelectValue: (categoryId: string, key: string, value: string) => void
  /** The "Pinned" shortlist toggle — not one of `options`, so it can't just
   *  be another entry in that array: it narrows ACROSS categories rather
   *  than being one, and it's the single most important chip in the row, so
   *  it renders right after Show all/Hide all rather than sorted in among
   *  the regular category chips by count like everything else here. */
  pinnedChip?: React.ReactNode
  /** Whether the Pinned chip (above) is currently on — folded into "is
   *  everything on" below (only while `pinnedChip` is actually rendered, so
   *  its absence — nothing pinned yet — can't read as "something's off")
   *  so Show all/Hide all's own label, and what tapping it does, accounts
   *  for Pinned too, not just the real categories. */
  pinnedOn?: boolean
}

/** The filter bar above the map: a chip per category that doubles as the color
 *  legend, plus "Show all" / "Hide all" shortcuts. A single horizontal-scroll
 *  row (native scrollbar, styled thin via the `chip-scroll` class in
 *  globals.css) rather than wrapping, so it stays compact over the map. */
export default function CategoryFilter({
  options,
  selected,
  onToggle,
  onAll,
  onNone,
  maxVisible,
  onMore,
  wrap,
  categories,
  points,
  boolFields,
  onToggleBool,
  selectFilters,
  onToggleSelectValue,
  pinnedChip,
  pinnedOn,
}: Props) {
  // Mobile keeps the original, simpler chip: a filter segment only shows up
  // once something's already active (spelled out, e.g. "IKC"), and tapping
  // it just reviews/unchecks what's set — no way to discover a NEW filter
  // from the chip itself (that's still the full-screen category picker's
  // job). Desktop gets the newer discover-anywhere chevron, always present
  // on any category with filterable fields, opening the full editor. Same
  // shared component either way — this is the one thing that still tells
  // the two apart, everything else below branches off it.
  const isMobile = useIsMobile()
  const allOn = options.every((o) => selected.has(o.id)) && (!pinnedChip || !!pinnedOn)

  // The compact row's own display order — deliberately NOT re-derived from
  // `selected` on every render. A category checked from elsewhere (the
  // full-screen picker, or already checked on arrival) that isn't part of
  // the visible row yet still gets promoted to the front, same as always —
  // that visitor never had a position in this row to remember. But a chip
  // that's ALREADY visible must never jump when tapped in place: once
  // someone has scanned this row they've built a spatial map of it
  // ("grocery is third"), and moving the chip they just tapped breaks that
  // memory and can land a fast second tap on whatever slid into its spot.
  //
  // Only matters when `maxVisible` truncates the row — the full/wrap picker
  // (`maxVisible` unset) already shows every chip, so there's nothing to
  // promote and `order` stays unused.
  const [order, setOrder] = useState<string[] | null>(null)
  const optionIds = options.map((o) => o.id).join(',')
  const prevSelectedRef = useRef(selected)
  useEffect(() => {
    if (maxVisible == null) return
    const ids = options.map((o) => o.id)
    const prevSelected = prevSelectedRef.current
    prevSelectedRef.current = selected
    setOrder((prev) => {
      if (!prev || prev.length !== ids.length || !ids.every((id) => prev.includes(id))) {
        // An unseen set of categories (mount, or the category list itself
        // changed) — seed selected-first, same promotion this row always
        // did on arrival.
        return [...options].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).map((o) => o.id)
      }
      const visibleIds = new Set(prev.slice(0, maxVisible))
      // Only an id that just became selected AND isn't already visible gets
      // promoted — an id toggled on or off while already in view is left
      // exactly where it was.
      const toPromote = ids.filter((id) => selected.has(id) && !prevSelected.has(id) && !visibleIds.has(id))
      if (toPromote.length === 0) return prev
      return [...toPromote, ...prev.filter((id) => !toPromote.includes(id))]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionIds, selected, maxVisible])

  const visible =
    maxVisible != null
      ? (order ?? options.map((o) => o.id))
          .map((id) => options.find((o) => o.id === id))
          .filter((o): o is FilterOption => !!o)
          .slice(0, maxVisible)
      : options
  const hiddenCount = maxVisible != null ? Math.max(0, options.length - maxVisible) : 0

  // Which category's inline filter editor is open — opened by tapping a
  // chip's own chevron (rather than the chip itself, which keeps toggling
  // the category on/off) — and where it's anchored: computed from that
  // button's own position so the popup drops down attached right below
  // whichever chip was actually tapped, not the row as a whole. Fixed
  // positioning (not absolute) so it isn't clipped by the chip row's own
  // horizontal scroll container. At most one open at a time.
  const [openFilterFor, setOpenFilterFor] = useState<string | null>(null)
  // Desktop anchors by its RIGHT edge to the tapped chip's own right edge
  // (not its left) — the popup usually needs more width than the chip
  // itself (Kosher Cert, Type, …), so growing it rightward from the chip's
  // left edge would push it out past the chip and read as belonging to
  // whatever's next in the row instead. Growing left from the chip's own
  // right edge keeps it visually anchored under the chip that opened it.
  // Mobile's review-only popup is small enough that this doesn't come up —
  // it anchors by its LEFT edge to the tapped filter segment itself, same as
  // main always did.
  const [popupPos, setPopupPos] = useState<
    { top: number; right: number; minWidth: number } | { top: number; left: number; width: number } | null
  >(null)
  // Which of the open editor's own select-field dropdowns (Kosher Cert,
  // Denomination, …) is expanded — same pattern the full-screen picker's
  // own expanded row uses (see CategoryFilterControls), just scoped to
  // whichever chip's editor is currently open.
  const [openSelectDropdown, setOpenSelectDropdown] = useState<string | null>(null)
  const containerRefs = useRef(new Map<string, HTMLDivElement>())
  // The popup itself is portaled to document.body (so it can't be knocked
  // out of place by an ancestor's CSS transform — see CategoryFilterControls'
  // own nested CheckboxDropdown for the same fix) — it's no longer a DOM
  // descendant of the chip's own container, so it needs its own ref for the
  // outside-click check below.
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openFilterFor) return
    function handleClick(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      const chipEl = openFilterFor ? containerRefs.current.get(openFilterFor) : null
      if (chipEl?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      // A select field's own checkbox list (e.g. Kosher Cert's values) is a
      // SEPARATE portal nested inside this one (see CheckboxDropdown) — not
      // a DOM descendant of popupRef once portaled — so without this check
      // a click on one of its checkboxes reads as "outside" and closes this
      // whole editor via mousedown before the checkbox's own click/onChange
      // ever fires, making filter selection silently do nothing.
      if (target instanceof Element && target.closest('[data-checkbox-dropdown-popup]')) return
      setOpenFilterFor(null)
    }
    // Close if the user scrolls the chip row (or the page) so the popup
    // doesn't float in the wrong spot, detached from the chip it came from.
    function handleScroll() {
      setOpenFilterFor(null)
    }
    // Capture phase, and both mousedown and touchstart — the map underneath
    // (Google Maps' own drag/pan handling) and the nearby-list sheet's own
    // drag-to-resize gesture both call stopPropagation()/preventDefault() on
    // the touch that starts a drag, which (a) stops a bubble-phase listener
    // from ever seeing it and (b) can suppress the synthetic mousedown a
    // touch would otherwise generate entirely. A capture-phase listener on
    // document fires before any of that — nothing can run early enough to
    // pre-empt it — and listening to touchstart too means there's no
    // synthetic-mousedown step to lose in the first place.
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('touchstart', handleClick, true)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('touchstart', handleClick, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [openFilterFor])

  // Tapping a category's filter segment while the category itself is off
  // re-checks it instead of opening the editor — reviewing/discovering
  // filters for a category that isn't even shown on the map doesn't mean
  // anything, so the tap does the one thing that's actually useful here.
  function openEditor(id: string, on: boolean, trigger: HTMLElement) {
    if (!on) {
      onToggle(id)
      return
    }
    if (openFilterFor === id) {
      setOpenFilterFor(null)
      return
    }
    if (isMobile) {
      // The tapped segment's own rect — main always anchored here.
      const rect = trigger.getBoundingClientRect()
      setPopupPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    } else {
      // The whole chip's own rect (not just the chevron segment) — see
      // popupPos above for why this anchors by its right edge.
      const chipEl = containerRefs.current.get(id)
      if (!chipEl) return
      const rect = chipEl.getBoundingClientRect()
      setPopupPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, minWidth: rect.width })
    }
    setOpenSelectDropdown(null)
    setOpenFilterFor(id)
  }

  const openCategory = openFilterFor ? categories.find((c) => c.id === openFilterFor) : undefined

  return (
    <div className={wrap ? 'flex flex-wrap items-center gap-1.5' : 'chip-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1'}>
      <button
        onClick={allOn ? onNone : onAll}
        className="shrink-0 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
      >
        {allOn ? 'Hide all' : 'Show all'}
      </button>
      {pinnedChip}
      {visible.map((o) => {
        const on = selected.has(o.id)
        const editorOpen = openFilterFor === o.id
        const cat = categories.find((c) => c.id === o.id)
        // Desktop: any category with filterable fields, so there's a way to
        // discover a filter that isn't set yet. Mobile: only once a filter's
        // already active, spelled out on the segment itself — see the note
        // above `isMobile`.
        const hasFilters = isMobile ? !!o.filterSuffix : categoryHasFilterableFields(cat)
        return (
          <div
            key={o.id}
            ref={(el) => {
              if (el) containerRefs.current.set(o.id, el)
              else containerRefs.current.delete(o.id)
            }}
            className="relative shrink-0"
          >
            <div
              className={`flex items-stretch rounded-full border text-xs font-medium transition-colors ${
                on ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-500'
              }`}
              style={on ? { backgroundColor: o.color } : undefined}
            >
              <button
                onClick={() => onToggle(o.id)}
                aria-pressed={on}
                title={o.filterSuffix ? `Filtered: ${o.filterSuffix}` : undefined}
                className={`flex items-center gap-1 py-1 pl-2.5 ${hasFilters ? 'pr-1.5' : 'pr-2.5'} ${
                  on ? 'rounded-full' : 'rounded-full hover:bg-slate-50'
                } cursor-pointer`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full ring-1 ring-white/60"
                  style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : o.color }}
                  aria-hidden="true"
                />
                {o.icon && <span aria-hidden="true">{o.icon}</span>}
                <span>{o.label}</span>
                {/* The count already reflects the active filter (e.g. 71 →
                    5), same as the full-screen picker's own row — a
                    dot next to it just flags THAT a filter narrowed it,
                    without spelling out which one (see the title attribute
                    above for that, on hover) — much more compact than
                    printing the filter's own name/value on every chip. */}
                <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
                {/* Desktop only — the count already reflects the active
                    filter (e.g. 71 → 5); the dot just flags THAT one narrowed
                    it (see the title attribute above, on hover), more
                    compact than spelling it out on every chip. Mobile spells
                    it out directly on the segment instead (below), same as
                    main always did, so no dot needed here too. */}
                {!isMobile && o.filterSuffix && (
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-white' : 'bg-primary'}`}
                    aria-hidden="true"
                  />
                )}
              </button>
              {hasFilters && (
                isMobile ? (
                  // Mobile: the segment IS the active filter's own label —
                  // tapping it reviews/unchecks what's set. No standing
                  // affordance to discover a filter that isn't active yet;
                  // that's still the full-screen category picker's job.
                  <button
                    onClick={(e) => openEditor(o.id, on, e.currentTarget)}
                    aria-expanded={editorOpen}
                    aria-label={`Edit ${o.label} filters`}
                    className={`rounded-r-full border-l pl-1 pr-2.5 py-1 cursor-pointer ${
                      on ? 'border-white/30 text-white/90 hover:bg-black/10' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {o.filterSuffix}
                  </button>
                ) : (
                  // Desktop: always present for any category with filterable
                  // fields — not just once one's already active — so there's
                  // a visible way to discover and turn one on in the first
                  // place, not only to review/remove one already set some
                  // other way (the full-screen picker).
                  <button
                    onClick={(e) => openEditor(o.id, on, e.currentTarget)}
                    aria-expanded={editorOpen}
                    aria-label={`${o.label} filters`}
                    className={`flex items-center rounded-r-full border-l pl-1 pr-2 py-1 cursor-pointer ${
                      on ? 'border-white/30 text-white/90 hover:bg-black/10' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform ${editorOpen ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                )
              )}
            </div>

            {editorOpen && popupPos && openCategory && (
              isMobile ? (() => {
                // Review-only: just the entries already active, each a
                // checkbox to remove it — same as main. Nothing left to
                // review — rather than leave an empty box hanging open,
                // disappear along with the last unchecked entry (the chip's
                // own filterSuffix vanishes at the same moment).
                const entries = activeFilterEntries(openCategory, boolFields, selectFilters)
                if (entries.length === 0) return null
                return createPortal(
                  <div
                    ref={popupRef}
                    style={
                      'left' in popupPos
                        ? { position: 'fixed', top: popupPos.top, left: popupPos.left, minWidth: popupPos.width }
                        : undefined
                    }
                    className="z-50 rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg"
                  >
                    <div className="flex flex-col gap-1">
                      {entries.map((entry) => (
                        <label
                          key={entry.kind === 'bool' ? entry.key : `${entry.key}:${entry.value}`}
                          className="flex items-center gap-1.5 rounded px-1 py-1 text-xs whitespace-nowrap text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked
                            onChange={() =>
                              entry.kind === 'bool'
                                ? onToggleBool(openCategory.id, entry.key)
                                : onToggleSelectValue(openCategory.id, entry.key, entry.value)
                            }
                            className="accent-primary h-3.5 w-3.5 shrink-0 cursor-pointer"
                          />
                          {entry.label}
                        </label>
                      ))}
                    </div>
                  </div>,
                  document.body,
                )
              })() : (
                createPortal(
                  <div
                    ref={popupRef}
                    // A floor, not a fixed size — never narrower than the
                    // chip it dropped down from, but free to grow wider if
                    // the filter controls need more room, rather than
                    // wrapping them awkwardly to stay within it. No card
                    // background of its own — the pills/dropdowns inside
                    // (CategoryFilterControls) already carry their own
                    // white/bordered look, so a second white box behind them
                    // just read as visual clutter.
                    style={
                      'right' in popupPos
                        ? { position: 'fixed', top: popupPos.top, right: popupPos.right, minWidth: popupPos.minWidth }
                        : undefined
                    }
                    className="z-50 max-w-xs"
                  >
                    <CategoryFilterControls
                      category={openCategory}
                      categoryId={openCategory.id}
                      points={points}
                      boolFields={boolFields}
                      onToggleBool={onToggleBool}
                      selectFilters={selectFilters}
                      onToggleSelectValue={onToggleSelectValue}
                      openDropdown={openSelectDropdown}
                      onOpenDropdown={setOpenSelectDropdown}
                    />
                  </div>,
                  document.body,
                )
              )
            )}
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
}
