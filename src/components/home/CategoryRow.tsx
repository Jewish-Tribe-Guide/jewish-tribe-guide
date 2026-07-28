'use client'

import { useEffect, useState } from 'react'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource, NavigateFn } from '@/types'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { distanceMiles } from '@/lib/geo'
import { travelCompare } from '@/lib/listingTravel'
import { hoursOpenNow } from '@/lib/hours'
import { listingSearchText } from '@/lib/searchListing'
import { ui } from '@/lib/uiConfig'
import { resolveCapabilities } from '@/lib/categories'
import { ACCENT_PALETTE } from '@/components/map/ResourceMapView'

/** This category's search/sort/filter state — lifted out of this component
 *  (was local useState) so the same state can also drive a filter-button
 *  bar the caller renders elsewhere (the map key's own top row swaps to
 *  this category's filters while it's the only one focused, see
 *  ResourceMapView), instead of this row owning a second, disconnected
 *  copy of it. */
export type CategoryFilterState = {
  search: string
  openNow: boolean
  bool: Record<string, boolean>
  select: Record<string, string[]>
  sortByPopular: boolean
}

export const DEFAULT_CATEGORY_FILTER: CategoryFilterState = {
  search: '',
  openNow: false,
  bool: {},
  select: {},
  sortByPopular: false,
}

/** One togglable filter button — Open Now, a boolean field, or one value of
 *  a select field — described declaratively so the same definitions can
 *  render as ToggleButtons inline here AND as the map key's own top-bar
 *  buttons (see ResourceMapView), rather than each place recomputing which
 *  fields are filterable and which values actually occur. */
export type FilterChip = { id: string; label: string } & (
  | { type: 'openNow' }
  | { type: 'bool'; key: string }
  | { type: 'select'; key: string; value: string }
)

// Distinct values actually present among this category's items — a select
// filter only earns its space once there are ≥2 real values to choose
// between, same as the directory page.
function distinctOptions(field: CategoryField, items: DirectoryResource[]) {
  const present = new Set<string>()
  for (const item of items) {
    const v = item[field.key]
    if (typeof v === 'string' && v) present.add(v)
  }
  const opts = field.options?.length
    ? field.options.filter((o) => present.has(o.value))
    : Array.from(present).map((v) => ({ value: v, label: v }))
  return opts
}

export function buildFilterChips(category: CategoryConfig, items: DirectoryResource[]): FilterChip[] {
  const fields = category.detailFields
  const hoursFields = fields.filter((f) => f.type === 'hours' && f.filterable)
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')

  const chips: FilterChip[] = []
  if (hoursFields.length > 0) chips.push({ id: 'openNow', type: 'openNow', label: 'Open now' })
  for (const f of filterableBooleans) {
    chips.push({ id: `bool:${f.key}`, type: 'bool', key: f.key, label: f.filterLabel ?? f.label })
  }
  for (const f of filterableSelects) {
    const opts = distinctOptions(f, items)
    if (opts.length < 2) continue
    for (const o of opts) chips.push({ id: `select:${f.key}:${o.value}`, type: 'select', key: f.key, value: o.value, label: o.label })
  }
  return chips
}

export function isChipActive(chip: FilterChip, filters: CategoryFilterState): boolean {
  switch (chip.type) {
    case 'openNow':
      return filters.openNow
    case 'bool':
      return !!filters.bool[chip.key]
    case 'select':
      return (filters.select[chip.key] ?? []).includes(chip.value)
  }
}

export function toggleSelectValue(filters: CategoryFilterState, category: CategoryConfig, key: string, value: string): CategoryFilterState {
  const field = category.detailFields.find((f) => f.key === key)
  const multi = !!field?.multiSelect
  const chosen = filters.select[key] ?? []
  const nextChosen = multi
    ? chosen.includes(value)
      ? chosen.filter((v) => v !== value)
      : [...chosen, value]
    : chosen.includes(value)
      ? []
      : [value]
  return { ...filters, select: { ...filters.select, [key]: nextChosen } }
}

export function toggleChip(chip: FilterChip, filters: CategoryFilterState, category: CategoryConfig): CategoryFilterState {
  switch (chip.type) {
    case 'openNow':
      return { ...filters, openNow: !filters.openNow }
    case 'bool':
      return { ...filters, bool: { ...filters.bool, [chip.key]: !filters.bool[chip.key] } }
    case 'select':
      return toggleSelectValue(filters, category, chip.key, chip.value)
  }
}

/** Applies this category's search/Open Now/boolean/select filters to its
 *  items — pulled out of the component so the map key's merged multi-
 *  category list (see ResourceMapView) can filter a category's items the
 *  same way this row itself would, without actually rendering the row. */
export function filterCategoryItems(category: CategoryConfig, items: DirectoryResource[], filters: CategoryFilterState): DirectoryResource[] {
  const fields = category.detailFields
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')
  const hoursFields = fields.filter((f) => f.type === 'hours' && f.filterable)
  const hasFilterableHours = hoursFields.length > 0
  const tokens = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return items.filter((item) => {
    if (tokens.length && !tokens.every((t) => listingSearchText(item, category).includes(t))) return false
    if (filters.openNow && hasFilterableHours && !hoursFields.some((f) => hoursOpenNow(item[f.key]) === true)) return false
    for (const f of filterableBooleans) {
      if (filters.bool[f.key] && !item[f.key]) return false
    }
    for (const f of filterableSelects) {
      const chosen = filters.select[f.key]
      if (chosen?.length && !chosen.includes(item[f.key] as string)) return false
    }
    return true
  })
}

type Props = {
  category: CategoryConfig
  /** Every listing in this category (unfiltered) — filtering/sorting happens
   *  entirely inside this row, same as the category's own directory page. */
  items: DirectoryResource[]
  coords: { lat: number; lng: number } | null
  onNavigate: NavigateFn
  onFocusListing?: (mapPointId: string | null) => void
  /** The map point id currently isolated — e.g. tapped as a pin on the map
   *  beside this list — so this row can expand + scroll to that card, same
   *  as tapping it here directly would. */
  focusedListingId?: string | null
  /** Same color as this category's pins/chip on the map — painted on a card
   *  when it's the one currently focused (see `focusedListingId`), so the
   *  highlight reads as "this category, this pin" rather than a generic
   *  selected state. */
  accentColor?: string
  /** Reports the ids currently surviving this row's own filters (in the same
   *  order) — lets the map narrow to exactly what's shown here as filters
   *  change, instead of the whole category. */
  onVisibleIdsChange?: (ids: string[]) => void
  /** Tapping a card here still isolates it (via `onFocusListing`) but no
   *  longer expands its details inline — used by the map's flyout-of-a-
   *  flyout list, whose caller renders the expanded details as a separate
   *  third panel instead (Google Maps-style), rather than an accordion
   *  inside this same list. */
  hideCardExpansion?: boolean
  /** Search/sort/filter state for this category, and how to change it — see
   *  `CategoryFilterState` above. */
  filters: CategoryFilterState
  onFiltersChange: (next: CategoryFilterState) => void
  /** Hides this row's own inline Open Now/boolean/select filter buttons —
   *  used when the caller is rendering that same `filters` state as its own
   *  button bar instead (see ResourceMapView), so the two don't duplicate
   *  each other. The search box and Popular/Distance sort stay put either
   *  way — only the ToggleButton row moves. */
  hideFilterChips?: boolean
}

function ToggleButton({
  active,
  onClick,
  borderColor,
  children,
}: {
  active: boolean
  onClick: () => void
  /** Cycled from ACCENT_PALETTE — shown on the inactive (unselected) state;
   *  active keeps the single, consistent accent-2 fill as the "this one's on"
   *  signal, same as elsewhere. */
  borderColor: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={active ? undefined : { borderColor }}
      className={`rounded-full border-2 px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
        active ? 'bg-[#df4c73] text-white border-[#df4c73]' : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

/** One category's search + sort + filters + listing cards, inline in the home
 *  page's sidebar — the same behavior as that category's own directory page
 *  (GenericDirectory), just compact and without a page navigation. */
export default function CategoryRow({
  category,
  items,
  coords,
  onNavigate,
  onFocusListing,
  focusedListingId,
  accentColor,
  onVisibleIdsChange,
  hideCardExpansion,
  filters,
  onFiltersChange,
  hideFilterChips,
}: Props) {
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  const fields = category.detailFields
  const caps = resolveCapabilities(category.capabilities)
  const showSearch = ui.search.directory && caps.directorySearch
  const tagField = fields.find((f) => f.type === 'tags')
  const upvotes = !!category.upvotesEnabled
  const chips = buildFilterChips(category, items)

  const openListing = (item: DirectoryResource, term?: string) =>
    onNavigate('patient', 'find', { findView: category.id, findQuery: term, findItemId: item.id })

  const filtered = filterCategoryItems(category, items, filters)

  const withDistance = filtered.map((item) =>
    coords && item.geo ? { ...item, milesFromAddress: distanceMiles(coords, item.geo) } : item,
  )
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0
  const sorted = [...withDistance].sort((a, b) =>
    upvotes && filters.sortByPopular ? liveCount(b) - liveCount(a) || travelCompare(a, b) : travelCompare(a, b),
  )

  // Keep the map in sync with whatever this row's own filters currently show.
  // Keyed on a stable string (not the array itself, a fresh reference every
  // render) so this only reports when the actual visible set changes.
  const idsKey = sorted.map((item) => item.id).join(',')
  useEffect(() => {
    onVisibleIdsChange?.(sorted.map((item) => item.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  // Cycled across every filter button rendered below, so adjacent buttons
  // (Open Now, each boolean, each select option) don't repeat the same color.
  let colorIdx = 0
  const nextBorderColor = () => ACCENT_PALETTE[colorIdx++ % ACCENT_PALETTE.length]

  return (
    <div className="space-y-1.5">
      {/* Only the standalone map screen's own row still shows this — the
          map key's flyout (`hideCardExpansion`) reuses the search bar
          already floating above the whole dropdown instead of a second,
          redundant one here. */}
      {showSearch && !hideCardExpansion && (
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={tagField ? `Search or ${tagField.label.toLowerCase()} (e.g. cheese)…` : 'Search…'}
          className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}

      {!hideFilterChips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <ToggleButton
              key={chip.id}
              active={isChipActive(chip, filters)}
              onClick={() => onFiltersChange(toggleChip(chip, filters, category))}
              borderColor={nextBorderColor()}
            >
              {chip.label}
            </ToggleButton>
          ))}
        </div>
      )}

      {upvotes && (
        <div className="flex w-fit gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => onFiltersChange({ ...filters, sortByPopular: true })}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              filters.sortByPopular ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ▲ Popular
          </button>
          <button
            onClick={() => onFiltersChange({ ...filters, sortByPopular: false })}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              !filters.sortByPopular ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Distance
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-[10px] text-muted">No matches. Try clearing a filter.</p>
      ) : hideCardExpansion ? (
        // Name + a smaller category/distance subtitle, no badges/address/
        // fields beyond that — the map's flyout-of-a-flyout list is just a
        // picker; the full card lives in the third panel a tap here opens.
        // Being the currently-open one turns the name (and its subtitle)
        // the category's own accent color — the hint that there's more
        // behind a click, via a CSS custom property since `accentColor` is
        // a runtime hex, not a Tailwind class Tailwind could see at build
        // time.
        <ul className="space-y-0.5">
          {sorted.map((item) => {
            const isFocused = item.id === focusedListingId
            const subtitle = [category.label, item.milesFromAddress != null ? `${item.milesFromAddress.toFixed(1)} mi` : null]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={item.id}>
                <button
                  onClick={() => onFocusListing?.(isFocused ? null : item.id)}
                  style={{ '--accent': accentColor ?? '#700F0F', ...(isFocused ? { color: 'var(--accent)' } : {}) } as React.CSSProperties}
                  className={`group block w-full rounded px-1 py-1 text-left transition-colors cursor-pointer hover:text-[var(--accent)] ${
                    isFocused ? 'bg-slate-100' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate text-[10px] font-medium">{item.name}</span>
                  {subtitle && (
                    <span className="block truncate text-[9px] font-normal text-slate-400 group-hover:text-[var(--accent)]">
                      {subtitle}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <GenericListingCard
              key={item.id}
              item={item}
              category={category}
              upvotes={upvotes}
              count={liveCount(item)}
              expanded={item.id === focusedListingId}
              highlightColor={accentColor}
              dense
              onVote={(count) => setVoteCounts((prev) => ({ ...prev, [item.id]: count }))}
              onTagClick={(tag) => onFiltersChange({ ...filters, search: tag })}
              onFilterOpen={() => onFiltersChange({ ...filters, openNow: true })}
              onFilterBool={(key) => onFiltersChange({ ...filters, bool: { ...filters.bool, [key]: true } })}
              onFilterSelect={(key, value) => onFiltersChange(toggleSelectValue(filters, category, key, value))}
              onEdit={() => openListing(item)}
              onReport={() => openListing(item)}
              onExpandedChange={(expanded) => onFocusListing?.(expanded ? item.id : null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
