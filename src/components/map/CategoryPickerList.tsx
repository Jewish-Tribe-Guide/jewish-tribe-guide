'use client'

import { useState } from 'react'
import type { FilterOption } from './CategoryFilter'
import type { MapPoint } from './ResourceMap'
import { type CategoryConfig } from '@/lib/categories'
import CategoryFilterControls, { categoryHasFilterableFields, passesFilters } from './CategoryFilterControls'
import { ChevronRightIcon } from '@/components/icons'
import { CategoryGlyph } from '@/lib/categoryIcons'

type Props = {
  /** Already sorted (highest count first) by the caller. */
  options: FilterOption[]
  /** Real category configs, to look up each option's filterable fields —
   *  absent (undefined) for the synthetic Hospitals option, which has none. */
  categories: CategoryConfig[]
  /** Every plottable point, to compute which values of a select field
   *  actually occur within a given category (no point listing a value that
   *  wouldn't match anything). */
  points: MapPoint[]
  selected: Set<string>
  onToggle: (id: string) => void
  boolFields: string[]
  /** Also turns the category on if it wasn't already (see ResourceMapView's
   *  toggleBoolField) — setting a filter for a category implies wanting to
   *  see it. */
  onToggleBool: (categoryId: string, key: string) => void
  selectFilters: Record<string, string[]>
  /** Same auto-select-the-category behavior as onToggleBool. */
  onToggleSelectValue: (categoryId: string, key: string, value: string) => void
}

/**
 * The full-screen "More" picker's list — one full-width row per category
 * instead of the compact chip row's pill cluster, top-down for easier
 * one-handed mobile reach. The checkbox toggles a category in/out of the
 * current multi-category browse; a category that has its own filterable
 * fields (Kosher Cert, Denomination, …) also gets a chevron that expands the
 * row in place to reveal them — collapsed (pointing down) by default so the
 * top-down list stays scannable, rotating to point up once opened. Categories with
 * nothing to filter get no chevron at all, since there'd be nothing to expand
 * into. "Open now" is deliberately not included — it's a search term (see
 * ResourceMapView's OPEN_NOW_WORDS), not tied to any one category.
 *
 * The count next to each category reflects the currently-chosen filters (for
 * that category only — a Kosher Cert filter never affects Synagogues' count),
 * and each field's own dropdown options are faceted against every OTHER
 * active filter, so choosing one narrows what the others can still offer.
 */
export default function CategoryPickerList({
  options,
  categories,
  points,
  selected,
  onToggle,
  boolFields,
  onToggleBool,
  selectFilters,
  onToggleSelectValue,
}: Props) {
  // Which select-field dropdown is open, keyed `${categoryId}:${fieldKey}` so
  // two different categories can't collide if they happen to reuse a field key.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  // Which category's filter controls are expanded in place — at most one at a
  // time, so opening another row's filters tucks the previous one back away.
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  return (
    <div className="divide-y divide-slate-100">
      {options.map((o) => {
        const cat = categories.find((c) => c.id === o.id)
        const ownFieldKeys = new Set(cat?.detailFields.map((f) => f.key) ?? [])
        const hasFilters = categoryHasFilterableFields(cat)
        const on = selected.has(o.id)
        const catPoints = points.filter((p) => p.filterId === o.id)
        const filteredCount = catPoints.filter((p) => passesFilters(p.raw, ownFieldKeys, boolFields, selectFilters)).length
        const expanded = expandedCategory === o.id

        const rowContent = (
          <>
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: o.color }}
              aria-hidden="true"
            />
            {o.icon && (
              <CategoryGlyph categoryId={o.id} icon={o.icon} className="h-5 w-5 shrink-0" />
            )}
            <span className="flex-1 text-[15px] font-medium text-slate-900">{o.label}</span>
            <span className="text-sm text-slate-400">{filteredCount}</span>
          </>
        )

        return (
          <div key={o.id} className="py-2.5">
            <div className="flex items-center gap-3">
              <label className="flex shrink-0 items-center">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(o.id)}
                  aria-label={`Show ${o.label}`}
                  className="h-5 w-5 rounded border-slate-300 accent-primary cursor-pointer"
                />
              </label>
              {hasFilters ? (
                <button
                  onClick={() => setExpandedCategory(expanded ? null : o.id)}
                  aria-expanded={expanded}
                  className="flex flex-1 items-center gap-2.5 py-1.5 text-left cursor-pointer"
                >
                  {rowContent}
                  <ChevronRightIcon
                    className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${expanded ? '-rotate-90' : 'rotate-90'}`}
                  />
                </button>
              ) : (
                <div className="flex flex-1 items-center gap-2.5 py-1.5">
                  {rowContent}
                  {/* Same footprint as the chevron the filterable rows get,
                      just invisible — keeps every row's count in one
                      vertical column whether or not it has a chevron. */}
                  <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                </div>
              )}
            </div>

            {hasFilters && expanded && cat && (
              <div className="ml-8 mt-1.5">
                <CategoryFilterControls
                  category={cat}
                  categoryId={o.id}
                  points={points}
                  boolFields={boolFields}
                  onToggleBool={onToggleBool}
                  selectFilters={selectFilters}
                  onToggleSelectValue={onToggleSelectValue}
                  openDropdown={openDropdown}
                  onOpenDropdown={setOpenDropdown}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
