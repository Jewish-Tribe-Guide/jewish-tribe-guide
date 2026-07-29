'use client'

import { useState } from 'react'
import type { FilterOption } from './CategoryFilter'
import type { MapPoint } from './ResourceMap'
import { selectValues, type CategoryConfig } from '@/lib/categories'
import CheckboxDropdown from '@/components/resources/CheckboxDropdown'
import { ChevronRightIcon } from '@/components/icons'

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
  /** "View this category" — the picker's other job besides filtering: jump
   *  straight to browsing everything in just this one category. */
  onShowOnly: (id: string) => void
  boolFields: string[]
  /** Also turns the category on if it wasn't already (see ResourceMapView's
   *  toggleBoolField) — setting a filter for a category implies wanting to
   *  see it. */
  onToggleBool: (categoryId: string, key: string) => void
  selectFilters: Record<string, string[]>
  /** Same auto-select-the-category behavior as onToggleBool. */
  onToggleSelectValue: (categoryId: string, key: string, value: string) => void
}

/** Whether a point's raw listing passes every currently-active bool/select
 *  filter — except `excludeKey`, which is left out of the check entirely.
 *  Used two ways: with no exclusion, to count how many of a category's
 *  points would actually show if it were turned on right now; with a
 *  field's own key excluded, to compute THAT field's own dropdown options
 *  faceted against every OTHER active filter (so picking "Catering" narrows
 *  Kosher Cert down to only certs that actually occur on caterers, and picking
 *  a cert narrows Type down the same way) without a field ever filtering
 *  itself down to just what's already chosen. A field absent on the listing
 *  always passes — same lenient "doesn't apply to this listing" rule the
 *  map's own filter chips use. */
function passesFilters(
  raw: Record<string, unknown> | undefined,
  boolFields: string[],
  selectFilters: Record<string, string[]>,
  excludeKey?: string,
): boolean {
  if (!raw) return true
  for (const key of boolFields) {
    if (key === excludeKey) continue
    if (raw[key] !== undefined && raw[key] !== true) return false
  }
  for (const [key, values] of Object.entries(selectFilters)) {
    if (key === excludeKey || values.length === 0) continue
    const v = raw[key]
    if (v === undefined) continue
    const vals = selectValues(v)
    if (vals.length > 0 && !vals.some((x) => values.includes(x))) return false
  }
  return true
}

/**
 * The full-screen "More" picker's list — one full-width row per category
 * instead of the compact chip row's pill cluster, top-down for easier
 * one-handed mobile reach. Serves both of the picker's jobs: the checkbox
 * toggles a category in/out of the current multi-category browse, while
 * tapping the row itself (or its chevron) narrows straight down to browsing
 * that one category alone — the same "just show me this category" a tap on
 * its home-screen card would. Each row also surfaces that category's own
 * filterable fields (Kosher Cert, Denomination, …) right there, since
 * they'd otherwise only be reachable from inside that category's own
 * directory page. "Open now" is deliberately not included — it's a search
 * term (see ResourceMapView's OPEN_NOW_WORDS), not tied to any one category.
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
  onShowOnly,
  boolFields,
  onToggleBool,
  selectFilters,
  onToggleSelectValue,
}: Props) {
  // Which select-field dropdown is open, keyed `${categoryId}:${fieldKey}` so
  // two different categories can't collide if they happen to reuse a field key.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  return (
    <div className="divide-y divide-slate-100">
      {options.map((o) => {
        const cat = categories.find((c) => c.id === o.id)
        const boolFieldsFor = cat?.detailFields.filter((f) => f.filterable && f.type === 'boolean') ?? []
        const selectFieldsFor = cat?.detailFields.filter((f) => f.filterable && f.type === 'select') ?? []
        const on = selected.has(o.id)
        const catPoints = points.filter((p) => p.filterId === o.id)
        const filteredCount = catPoints.filter((p) => passesFilters(p.raw, boolFields, selectFilters)).length

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
              <button
                onClick={() => onShowOnly(o.id)}
                className="flex flex-1 items-center gap-2.5 py-1.5 text-left cursor-pointer"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: o.color }}
                  aria-hidden="true"
                />
                {o.icon && (
                  <span className="text-lg" aria-hidden="true">
                    {o.icon}
                  </span>
                )}
                <span className="flex-1 text-[15px] font-medium text-slate-900">{o.label}</span>
                <span className="text-sm text-slate-400">{filteredCount}</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            </div>

            {(boolFieldsFor.length > 0 || selectFieldsFor.length > 0) && (
              <div className="ml-8 mt-1.5 flex flex-wrap gap-1.5">
                {boolFieldsFor.map((f) => {
                  const active = boolFields.includes(f.key)
                  return (
                    <button
                      key={f.key}
                      onClick={() => onToggleBool(o.id, f.key)}
                      aria-pressed={active}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.filterLabel ?? f.label}
                    </button>
                  )
                })}
                {selectFieldsFor.map((f) => {
                  // Whether this control shows at all is based on the WHOLE
                  // category (unaffected by other active filters) — not the
                  // live facet below — so it doesn't blink in and out of
                  // existence as an unrelated filter changes elsewhere in the
                  // same category (confusingly reading as "my other filter
                  // just disappeared").
                  const wholeValues = Array.from(new Set(catPoints.flatMap((p) => selectValues(p.raw?.[f.key])))).sort()
                  if (wholeValues.length < 2) return null

                  const chosen = selectFilters[f.key] ?? []
                  // Faceted against every OTHER active filter (this field's own
                  // current selection excluded) — so choosing a value elsewhere
                  // narrows what this dropdown can still OFFER. Already-chosen
                  // values stay in the list even if the current combination
                  // makes them unreachable, so a selection can always be seen
                  // and unchecked instead of silently vanishing while still
                  // secretly filtering.
                  const facetedPoints = catPoints.filter((p) => passesFilters(p.raw, boolFields, selectFilters, f.key))
                  const facetedValues = new Set(facetedPoints.flatMap((p) => selectValues(p.raw?.[f.key])))
                  const presentValues = wholeValues.filter((v) => facetedValues.has(v) || chosen.includes(v))
                  const dropdownKey = `${o.id}:${f.key}`
                  const label =
                    chosen.length === 0
                      ? f.filterLabel ?? f.label
                      : chosen.length === 1
                        ? chosen[0]
                        : `${chosen.length} selected`
                  return (
                    <CheckboxDropdown
                      key={f.key}
                      label={label}
                      active={chosen.length > 0}
                      isOpen={openDropdown === dropdownKey}
                      onToggleOpen={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
                      onClose={() => setOpenDropdown(null)}
                      values={presentValues}
                      chosen={chosen}
                      onToggle={(v) => onToggleSelectValue(o.id, f.key, v)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
