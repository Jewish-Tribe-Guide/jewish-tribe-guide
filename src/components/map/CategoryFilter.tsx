'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CategoryConfig } from '@/lib/categories'
import { activeFilterEntries } from './CategoryFilterControls'

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
   *  for display (e.g. "Keilim", or "Catering, Keystone-K") — folded right
   *  into the chip instead of showing as a separate row of removable pills
   *  below it, so there's one thing to look at, not two. Doubles as its own
   *  tap target: tapping this part of the chip (rather than the rest of it)
   *  opens a small inline editor for that category's filters instead of
   *  toggling the category on/off. */
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
   *  its setters — needed only to power the inline filter editor a chip's
   *  `filterSuffix` opens. */
  categories: CategoryConfig[]
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
  boolFields,
  onToggleBool,
  selectFilters,
  onToggleSelectValue,
}: Props) {
  const allOn = options.every((o) => selected.has(o.id))
  const visible = maxVisible != null ? options.slice(0, maxVisible) : options
  const hiddenCount = maxVisible != null ? Math.max(0, options.length - maxVisible) : 0

  // Which category's inline filter editor is open — opened by tapping a
  // chip's own filterSuffix (rather than the chip itself, which keeps
  // toggling the category on/off) — and where it's anchored: computed from
  // that button's own position so the popup drops down attached right below
  // whichever chip was actually tapped, not the row as a whole. Fixed
  // positioning (not absolute) so it isn't clipped by the chip row's own
  // horizontal scroll container. At most one open at a time.
  const [openFilterFor, setOpenFilterFor] = useState<string | null>(null)
  // Sized and positioned to exactly match the tapped filterSuffix segment —
  // same left edge, same width, so the box reads as "this chip's own filters,
  // dropped down" rather than a free-floating panel of its own.
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRefs = useRef(new Map<string, HTMLDivElement>())
  // The popup itself is portaled to document.body (so it can't be knocked
  // out of place by an ancestor's CSS transform — see CategoryFilterControls'
  // own nested CheckboxDropdown for the same fix) — it's no longer a DOM
  // descendant of the chip's own container, so it needs its own ref for the
  // outside-click check below.
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openFilterFor) return
    function handleClick(e: MouseEvent) {
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
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [openFilterFor])

  function openEditor(id: string, trigger: HTMLElement) {
    if (openFilterFor === id) {
      setOpenFilterFor(null)
      return
    }
    const rect = trigger.getBoundingClientRect()
    setPopupPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setOpenFilterFor(id)
  }

  const openOption = openFilterFor ? options.find((o) => o.id === openFilterFor) : undefined
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
                className={`flex items-center gap-1 py-1 pl-2.5 ${o.filterSuffix ? 'pr-1.5' : 'pr-2.5'} ${
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
              </button>
              {o.filterSuffix && (
                <button
                  onClick={(e) => openEditor(o.id, e.currentTarget)}
                  aria-expanded={editorOpen}
                  aria-label={`Edit ${o.label} filters`}
                  className={`rounded-r-full border-l pl-1 pr-2.5 py-1 cursor-pointer ${
                    on ? 'border-white/30 text-white/90 hover:bg-black/10' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {o.filterSuffix}
                </button>
              )}
            </div>

            {editorOpen && popupPos && openOption && openCategory && (() => {
              const entries = activeFilterEntries(openCategory, boolFields, selectFilters)
              // Nothing left to review — rather than leave an empty box
              // hanging open, disappear along with the last unchecked entry
              // (the chip's own filterSuffix vanishes at the same moment).
              if (entries.length === 0) return null
              return createPortal(
                <div
                  ref={popupRef}
                  style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, width: popupPos.width }}
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
                              ? onToggleBool(openOption.id, entry.key)
                              : onToggleSelectValue(openOption.id, entry.key, entry.value)
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
            })()}
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
