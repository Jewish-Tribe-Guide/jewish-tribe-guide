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
      className={`rounded-full border-2 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
        active ? 'bg-[#df4c73] text-white border-[#df4c73]' : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

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

/** One category's search + sort + filters + listing cards, inline in the home
 *  page's sidebar — the same behavior as that category's own directory page
 *  (GenericDirectory), just compact and without a page navigation. */
export default function CategoryRow({ category, items, coords, onNavigate, onFocusListing, focusedListingId, accentColor, onVisibleIdsChange }: Props) {
  const [search, setSearch] = useState('')
  const [openNow, setOpenNow] = useState(false)
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})
  const [sortByPopular, setSortByPopular] = useState(false)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  const fields = category.detailFields
  const caps = resolveCapabilities(category.capabilities)
  const showSearch = ui.search.directory && caps.directorySearch
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')
  const hoursFields = fields.filter((f) => f.type === 'hours' && f.filterable)
  const hasFilterableHours = hoursFields.length > 0
  const tagField = fields.find((f) => f.type === 'tags')
  const upvotes = !!category.upvotesEnabled

  const toggleSelect = (key: string, value: string, multi: boolean) => {
    setSelectFilters((prev) => {
      const chosen = prev[key] ?? []
      if (multi) {
        return { ...prev, [key]: chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value] }
      }
      return { ...prev, [key]: chosen.includes(value) ? [] : [value] }
    })
  }

  const openListing = (item: DirectoryResource, term?: string) =>
    onNavigate('patient', 'find', { findView: category.id, findQuery: term, findItemId: item.id })

  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const filtered = items.filter((item) => {
    if (tokens.length && !tokens.every((t) => listingSearchText(item, category).includes(t))) return false
    if (openNow && hasFilterableHours && !hoursFields.some((f) => hoursOpenNow(item[f.key]) === true)) return false
    for (const f of filterableBooleans) {
      if (boolFilters[f.key] && !item[f.key]) return false
    }
    for (const f of filterableSelects) {
      const chosen = selectFilters[f.key]
      if (chosen?.length && !chosen.includes(item[f.key] as string)) return false
    }
    return true
  })

  const withDistance = filtered.map((item) =>
    coords && item.geo ? { ...item, milesFromAddress: distanceMiles(coords, item.geo) } : item,
  )
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0
  const sorted = [...withDistance].sort((a, b) =>
    upvotes && sortByPopular ? liveCount(b) - liveCount(a) || travelCompare(a, b) : travelCompare(a, b),
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
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => onNavigate('patient', 'find', { findView: category.id })}
          className="text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          View full page →
        </button>
      </div>

      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tagField ? `Search or ${tagField.label.toLowerCase()} (e.g. cheese)…` : 'Search…'}
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}

      {(hasFilterableHours || filterableBooleans.length > 0 || filterableSelects.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {hasFilterableHours && (
            <ToggleButton active={openNow} onClick={() => setOpenNow((v) => !v)} borderColor={nextBorderColor()}>
              Open now
            </ToggleButton>
          )}
          {filterableBooleans.map((f) => (
            <ToggleButton
              key={f.key}
              active={!!boolFilters[f.key]}
              onClick={() => setBoolFilters((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
              borderColor={nextBorderColor()}
            >
              {f.filterLabel ?? f.label}
            </ToggleButton>
          ))}
          {filterableSelects.flatMap((f) => {
            const opts = distinctOptions(f, items)
            if (opts.length < 2) return []
            return opts.map((o) => (
              <ToggleButton
                key={`${f.key}:${o.value}`}
                active={(selectFilters[f.key] ?? []).includes(o.value)}
                onClick={() => toggleSelect(f.key, o.value, !!f.multiSelect)}
                borderColor={nextBorderColor()}
              >
                {o.label}
              </ToggleButton>
            ))
          })}
        </div>
      )}

      {upvotes && (
        <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setSortByPopular(true)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              sortByPopular ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ▲ Popular
          </button>
          <button
            onClick={() => setSortByPopular(false)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              !sortByPopular ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Distance
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">No matches. Try clearing a filter.</p>
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
              onTagClick={(tag) => setSearch(tag)}
              onFilterOpen={() => setOpenNow(true)}
              onFilterBool={(key) => setBoolFilters((prev) => ({ ...prev, [key]: true }))}
              onFilterSelect={(key, value, multi) => toggleSelect(key, value, multi)}
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
