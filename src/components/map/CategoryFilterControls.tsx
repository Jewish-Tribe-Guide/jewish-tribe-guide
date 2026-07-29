'use client'

import type { CategoryConfig } from '@/lib/categories'
import { selectValues } from '@/lib/categories'
import type { MapPoint } from './ResourceMap'
import CheckboxDropdown from '@/components/resources/CheckboxDropdown'

/** Whether a point's raw listing passes every currently-active bool/select
 *  filter — except `excludeKey`, which is left out of the check entirely.
 *  Used two ways: with no exclusion, to count how many of a category's
 *  points would actually show if it were turned on right now; with a
 *  field's own key excluded, to compute THAT field's own dropdown options
 *  faceted against every OTHER active filter (so picking "Catering" narrows
 *  Kosher Cert down to only certs that actually occur on caterers, and picking
 *  a cert narrows Type down the same way) without a field ever filtering
 *  itself down to just what's already chosen.
 *
 *  `ownFieldKeys` are the keys the listing's OWN category actually declares —
 *  every point passed in already belongs to one category (see `catPoints`
 *  below), so a filter key that ISN'T one of that category's own fields is
 *  simply irrelevant here and always passes (a Kosher Cert filter has no
 *  opinion about Mikvah's count). But a key that IS one of the category's own
 *  fields is checked strictly, undefined included — a Mikvah that's simply
 *  never had "Keilim" toggled on doesn't quietly pass a Keilim filter just
 *  because the field happens to be unset; unset means no for a field that's
 *  actually its own. */
export function passesFilters(
  raw: Record<string, unknown> | undefined,
  ownFieldKeys: Set<string>,
  boolFields: string[],
  selectFilters: Record<string, string[]>,
  excludeKey?: string,
): boolean {
  if (!raw) return true
  for (const key of boolFields) {
    if (key === excludeKey || !ownFieldKeys.has(key)) continue
    if (raw[key] !== true) return false
  }
  for (const [key, values] of Object.entries(selectFilters)) {
    if (key === excludeKey || values.length === 0 || !ownFieldKeys.has(key)) continue
    if (!selectValues(raw[key]).some((x) => values.includes(x))) return false
  }
  return true
}

/** Whether a category has any own filterable bool/select field at all —
 *  used to decide whether a row/chip gets an expand-for-filters affordance
 *  in the first place (a category with nothing to filter gets no chevron,
 *  no popover trigger). */
export function categoryHasFilterableFields(cat: CategoryConfig | undefined): boolean {
  if (!cat) return false
  return cat.detailFields.some((f) => f.filterable && (f.type === 'boolean' || f.type === 'select'))
}

type Props = {
  category: CategoryConfig
  categoryId: string
  points: MapPoint[]
  boolFields: string[]
  onToggleBool: (categoryId: string, key: string) => void
  selectFilters: Record<string, string[]>
  onToggleSelectValue: (categoryId: string, key: string, value: string) => void
  /** Which select-field dropdown is open, keyed `${categoryId}:${fieldKey}` —
   *  owned by the caller so it can coexist with whatever else is expanded. */
  openDropdown: string | null
  onOpenDropdown: (key: string | null) => void
  /** 'wrap' (default) lets controls flow onto multiple lines, side by side —
   *  fine in the picker's full-width row. 'stack' puts one control per line —
   *  used by the chip's own narrow inline editor, where a wrapped row would
   *  read as a second, unrelated axis of layout right under a single chip. */
  layout?: 'wrap' | 'stack'
}

/** One category's own bool/select filter controls — a row of "Open now"-style
 *  pill toggles plus any faceted select dropdowns (Kosher Cert, Denomination,
 *  …). Shared between the full-screen picker's expanded row and the chip
 *  row's own small inline editor, so the faceting logic only exists once. */
export default function CategoryFilterControls({
  category,
  categoryId,
  points,
  boolFields,
  onToggleBool,
  selectFilters,
  onToggleSelectValue,
  openDropdown,
  onOpenDropdown,
  layout = 'wrap',
}: Props) {
  const ownFieldKeys = new Set(category.detailFields.map((f) => f.key))
  const boolFieldsFor = category.detailFields.filter((f) => f.filterable && f.type === 'boolean')
  const selectFieldsFor = category.detailFields.filter((f) => f.filterable && f.type === 'select')
  const catPoints = points.filter((p) => p.filterId === categoryId)

  if (boolFieldsFor.length === 0 && selectFieldsFor.length === 0) return null

  return (
    <div className={layout === 'stack' ? 'flex flex-col items-start gap-1.5' : 'flex flex-wrap gap-1.5'}>
      {boolFieldsFor.map((f) => {
        const active = boolFields.includes(f.key)
        return (
          <button
            key={f.key}
            onClick={() => onToggleBool(categoryId, f.key)}
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
        // Whether this control shows at all is based on the WHOLE category
        // (unaffected by other active filters) — not the live facet below —
        // so it doesn't blink in and out of existence as an unrelated filter
        // changes elsewhere in the same category (confusingly reading as "my
        // other filter just disappeared").
        const wholeValues = Array.from(new Set(catPoints.flatMap((p) => selectValues(p.raw?.[f.key])))).sort()
        if (wholeValues.length < 2) return null

        const chosen = selectFilters[f.key] ?? []
        // Faceted against every OTHER active filter (this field's own current
        // selection excluded) — so choosing a value elsewhere narrows what
        // this dropdown can still OFFER. Already-chosen values stay in the
        // list even if the current combination makes them unreachable, so a
        // selection can always be seen and unchecked instead of silently
        // vanishing while still secretly filtering.
        const facetedPoints = catPoints.filter((p) => passesFilters(p.raw, ownFieldKeys, boolFields, selectFilters, f.key))
        const facetedValues = new Set(facetedPoints.flatMap((p) => selectValues(p.raw?.[f.key])))
        const presentValues = wholeValues.filter((v) => facetedValues.has(v) || chosen.includes(v))
        const dropdownKey = `${categoryId}:${f.key}`
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
            onToggleOpen={() => onOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
            onClose={() => onOpenDropdown(null)}
            values={presentValues}
            chosen={chosen}
            onToggle={(v) => onToggleSelectValue(categoryId, f.key, v)}
            size="sm"
          />
        )
      })}
    </div>
  )
}
