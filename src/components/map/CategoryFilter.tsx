'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CategoryConfig } from '@/lib/categories'
import type { MapPoint } from './ResourceMap'
import CategoryFilterControls, { categoryHasFilterableFields } from './CategoryFilterControls'
import { ChevronRightIcon } from '@/components/icons'

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
}: Props) {
  const allOn = options.every((o) => selected.has(o.id))
  // Selected categories always take priority for the compact row's limited
  // slots over unselected ones — otherwise turning one on from the full
  // "More" list that isn't already one of the top-N by count would just
  // silently do nothing visible here, still hidden behind "More" despite now
  // actively filtering the map. `options` already comes in highest-count-
  // first order, and this sort is stable, so within each group (selected /
  // not) that count order is untouched — this only reorders across the
  // selected/unselected boundary itself.
  const visible =
    maxVisible != null
      ? [...options].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))).slice(0, maxVisible)
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
  // Sized and positioned to exactly match the tapped chip — same left edge,
  // same width, so the box reads as "this chip's own filters, dropped down"
  // rather than a free-floating panel of its own.
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number } | null>(null)
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

  // Tapping a category's chevron while the category itself is off re-checks
  // it instead of opening the editor — picking filters for a category that
  // isn't even shown on the map doesn't mean anything, so the tap does the
  // one thing that's actually useful here (same as turning its own filter
  // on used to do, back when the only way in was a field that already had
  // one active).
  function openEditor(id: string, on: boolean, trigger: HTMLElement) {
    if (!on) {
      onToggle(id)
      return
    }
    if (openFilterFor === id) {
      setOpenFilterFor(null)
      return
    }
    const rect = trigger.getBoundingClientRect()
    setPopupPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
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
      {visible.map((o) => {
        const on = selected.has(o.id)
        const editorOpen = openFilterFor === o.id
        const cat = categories.find((c) => c.id === o.id)
        const hasFilters = categoryHasFilterableFields(cat)
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
                <span className={on ? 'text-white/80' : 'text-slate-400'}>{o.count}</span>
                {/* Active-filter badge — purely informational (e.g. "Kosher");
                    the chevron below is what actually opens the editor, so
                    this doesn't need to be its own tap target anymore. */}
                {o.filterSuffix && (
                  <span className={`truncate ${on ? 'text-white/80' : 'text-slate-400'}`}>· {o.filterSuffix}</span>
                )}
              </button>
              {/* Always present for any category with filterable fields —
                  not just once one's already active — so there's a visible
                  way to discover and turn one on in the first place, not
                  only to review/remove one you already set some other way
                  (the full-screen picker). */}
              {hasFilters && (
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
              )}
            </div>

            {editorOpen && popupPos && openCategory && (
              createPortal(
                <div
                  ref={popupRef}
                  // A floor, not a fixed size — never narrower than the chip
                  // it dropped down from, but free to grow wider if the
                  // filter controls need more room, rather than wrapping
                  // them awkwardly to stay within it.
                  style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, minWidth: popupPos.width }}
                  className="z-50 max-w-xs rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg"
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
