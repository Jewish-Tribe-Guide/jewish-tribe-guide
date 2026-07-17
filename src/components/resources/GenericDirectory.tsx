'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource, MapFilters } from '@/types'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { hoursOpenNow } from '@/lib/hours'
import DirectoryHeader from './DirectoryHeader'
import CheckboxDropdown from './CheckboxDropdown'
import { GenericListingCard } from './GenericListingCard'
import UpButton from '@/components/UpButton'
import { PlusIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'
import { listingSearchText } from '@/lib/searchListing'
import { travelCompare } from '@/lib/listingTravel'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { ui } from '@/lib/uiConfig'

type Props = {
  category: CategoryConfig
  items: DirectoryResource[]
  /** Shown under the category title — hospital name for patients, typed address
   *  for community. Mirrors the subtitle pattern in About Your Hospital. */
  anchorLabel?: string
  /** When true and no anchorLabel, prompt the visitor to set their location. */
  addressPrompt?: boolean
  /** A listing to mount already expanded (restored after returning from a form). */
  reopenItemId?: string | null
  /** Seed the search box (e.g. "cheese" from a landing "Places" result). */
  initialSearch?: string
  onUp: () => void
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Navigate to the map screen pre-filtered to this category. Carries the active
   *  search query and field filters so the map opens showing the same results. */
  onViewMap?: (query?: string, filters?: MapFilters) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, initialSearch, onUp, onAdd, onEdit, onReport, onViewMap }: Props) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  // Multi-select: each key maps to the set of chosen values (empty = no filter).
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [sortByPopular, setSortByPopular] = useState(false)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isMobile = useIsMobile()

  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const hasFilterableHours = hoursFields.some((f) => f.filterable)
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')

  const upvotes = !!category.upvotesEnabled && ui.upvotes
  // Per-category capabilities layered under the global `ui.*` master switches.
  const caps = resolveCapabilities(category.capabilities)
  const canAdd = ui.contributions.add && caps.add
  const showSearch = ui.search.directory && caps.directorySearch
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0

  const reopenRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reopenItemId && reopenRef.current) {
      const headerH = (document.querySelector('header')?.getBoundingClientRect().height ?? 64) + 12
      const top = reopenRef.current.getBoundingClientRect().top + window.scrollY - headerH
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — only fire on mount

  const q = search.trim().toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  // Every word must appear somewhere in the listing's search text — name, address,
  // tags, or scalar detail fields (AND across words). Shares listingSearchText with
  // the landing search, so a place tapped there ("kosher cheese") survives this filter.
  const matchesSearch = (item: DirectoryResource) => {
    if (tokens.length === 0) return true
    const hay = listingSearchText(item, category)
    return tokens.every((t) => hay.includes(t))
  }

  const filtered = items
    .filter((item) => {
      if (!matchesSearch(item)) return false
      for (const f of filterableBooleans) {
        if (boolFilters[f.key] && !item[f.key]) return false
      }
      for (const f of filterableSelects) {
        const chosen = selectFilters[f.key]
        if (chosen?.length && !chosen.includes(item[f.key] as string)) return false
      }
      if (openNow && hasFilterableHours) {
        // Item must be open right now according to at least one filterable hours field.
        const isOpen = hoursFields
          .filter((f) => f.filterable)
          .some((f) => hoursOpenNow(item[f.key]) === true)
        if (!isOpen) return false
      }
      return true
    })
    .sort((a, b) =>
      upvotes && sortByPopular
        ? liveCount(b) - liveCount(a) || travelCompare(a, b)
        : travelCompare(a, b),
    )

  // Log searches that match no listing in this category — by the search text
  // alone, so an active filter (open-now, cert, etc.) doesn't look like a miss.
  useLogSearchMiss({
    query: search,
    hasResults: items.some(matchesSearch),
    ready: true,
    source: category.pluralLabel,
  })

  const searchPlaceholder =
    tagFields.length > 0
      ? isMobile
        ? `Search ${category.pluralLabel.toLowerCase()} or items…`
        : `Search ${category.pluralLabel.toLowerCase()} or kosher items (e.g. cheese)…`
      : 'Search…'

  // The toolbar row (filters + sort) only renders when there's something in it;
  // a select needs ≥2 distinct values before it's worth showing.
  const hasRenderedSelects = filterableSelects.some(
    (f) => new Set(items.map((item) => item[f.key] as string).filter(Boolean)).size >= 2,
  )
  const hasFilterRow =
    filterableBooleans.length > 0 || hasRenderedSelects || hasFilterableHours || !!upvotes

  const hasActiveFilters =
    search.trim() !== '' ||
    Object.values(boolFilters).some(Boolean) ||
    Object.values(selectFilters).some((v) => v.length > 0) ||
    openNow

  const activeFilterCount =
    Object.values(boolFilters).filter(Boolean).length +
    Object.values(selectFilters).filter((v) => v.length > 0).length +
    (openNow ? 1 : 0)
  const clearAll = () => {
    setSearch('')
    setBoolFilters({})
    setSelectFilters({})
    setOpenNow(false)
  }

  // The active field filters in the shape the map consumes (see MapFilters).
  const mapFilters = (): MapFilters => ({
    openNow: openNow || undefined,
    bool: Object.keys(boolFilters).filter((k) => boolFilters[k]),
    select: Object.fromEntries(Object.entries(selectFilters).filter(([, v]) => v.length > 0)),
  })

  return (
    <div>
      <UpButton label="All resources" onClick={onUp} />

      <DirectoryHeader
        title={category.pluralLabel}
        count={filtered.length}
        anchorLabel={anchorLabel}
        addressPrompt={addressPrompt}
        actions={
          <>
            {onViewMap && ui.map.enabled && !category.community && (
              <button
                onClick={() => onViewMap(search.trim() || undefined, mapFilters())}
                /* Desktop only — on mobile the Map button moves into the filter/sort
                   row (next to Filters) to keep the header uncluttered. */
                className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                🗺️ Map
              </button>
            )}
            {canAdd && (
              <button
                onClick={onAdd}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlusIcon className="h-4 w-4" /> Add
              </button>
            )}
          </>
        }
      />

      {/* Controls */}
      <div className="mb-4 space-y-2">
        {showSearch && (
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
        {showSearch && q && tagFields.length > 0 && (
          <p className="text-xs text-muted">
            Showing places matching &ldquo;{search.trim()}&rdquo; &middot;{' '}
            <button onClick={() => setSearch('')} className="text-primary hover:underline cursor-pointer">
              clear
            </button>
          </p>
        )}
        {hasFilterRow && (
          <>
            {/* ── Mobile: Filters + Map buttons, then sort toggle — all one line ── */}
            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className={[
                  'inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                  activeFilterCount > 0
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M3 4a1 1 0 000 2h14a1 1 0 000-2H3zm3 5a1 1 0 000 2h8a1 1 0 000-2H6zm2 5a1 1 0 000 2h4a1 1 0 000-2H8z" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {onViewMap && ui.map.enabled && !category.community && (
                <button
                  onClick={() => onViewMap(search.trim() || undefined, mapFilters())}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  🗺️ Map
                </button>
              )}
              {upvotes && (
                <div className="flex rounded-md border border-slate-300 overflow-hidden ml-auto">
                  {[{ v: true, label: '▲ Popular' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setSortByPopular(opt.v)}
                      className={[
                        'px-2.5 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                        sortByPopular === opt.v ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Filter controls: collapsible on mobile, always visible on desktop ── */}
            <div
              className={[
                'gap-2',
                // Mobile: vertical wrap inside collapsed panel
                filtersOpen ? 'flex flex-wrap' : 'hidden',
                // Desktop: always show as horizontal scroll row
                'sm:flex sm:flex-nowrap sm:overflow-x-auto sm:pb-1',
              ].join(' ')}
              style={{ scrollbarWidth: 'none' }}
            >
              {hasFilterableHours && (
                <button
                  onClick={() => setOpenNow((v) => !v)}
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                    openNow
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={['inline-block h-2 w-2 rounded-full', openNow ? 'bg-white' : 'bg-green-500'].join(' ')} aria-hidden="true" />
                  Open now
                </button>
              )}
              {filterableBooleans.map((f) => {
                const active = !!boolFilters[f.key]
                return (
                  <button
                    key={f.key}
                    onClick={() => setBoolFilters((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                    className={[
                      'shrink-0 px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap',
                      active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {f.filterLabel ?? f.label}
                  </button>
                )
              })}
              {filterableSelects.map((f) => {
                const presentValues = Array.from(new Set(items.map((item) => item[f.key] as string).filter(Boolean))).sort()
                if (presentValues.length < 2) return null
                const chosen = selectFilters[f.key] ?? []
                const toggle = (v: string) =>
                  setSelectFilters((prev) => {
                    const cur = prev[f.key] ?? []
                    return { ...prev, [f.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }
                  })
                if (f.multiSelect) {
                  const isOpen = openDropdown === f.key
                  const label = chosen.length === 0
                    ? `All ${f.filterLabel ?? f.label}s`
                    : chosen.length === 1
                    ? chosen[0]
                    : `${chosen.length} selected`
                  return (
                    <CheckboxDropdown
                      key={f.key}
                      label={label}
                      active={chosen.length > 0}
                      isOpen={isOpen}
                      onToggleOpen={() => setOpenDropdown(isOpen ? null : f.key)}
                      onClose={() => setOpenDropdown(null)}
                      values={presentValues}
                      chosen={chosen}
                      onToggle={toggle}
                    />
                  )
                }
                return (
                  <select
                    key={f.key}
                    value={chosen[0] ?? ''}
                    onChange={(e) =>
                      setSelectFilters((prev) => ({ ...prev, [f.key]: e.target.value ? [e.target.value] : [] }))
                    }
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    <option value="">All {f.filterLabel ?? f.label}s</option>
                    {presentValues.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )
              })}
              {upvotes && (
                <div className="hidden sm:flex rounded-md border border-slate-300 overflow-hidden shrink-0 sm:ml-auto">
                  {[{ v: true, label: '▲ Popular' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setSortByPopular(opt.v)}
                      className={[
                        'px-3 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                        sortByPopular === opt.v ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">
            {hasActiveFilters
              ? `No ${category.pluralLabel.toLowerCase()} match your search.`
              : `No ${category.pluralLabel.toLowerCase()} listed yet.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Clear search &amp; filters
              </button>
            )}
            {canAdd && (
              <button
                onClick={onAdd}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary border border-primary rounded-md px-3 py-1.5 hover:bg-primary hover:text-white transition-colors cursor-pointer"
              >
                <PlusIcon className="h-4 w-4" /> Add {category.label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} ref={item.id === reopenItemId ? reopenRef : undefined}>
            <GenericListingCard
              item={item}
              category={category}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
              onTagClick={setSearch}
              onFilterOpen={() => setOpenNow((v) => !v)}
              onFilterBool={(key) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              onFilterSelect={(key, value, multi) =>
                setSelectFilters((prev) => {
                  const cur = prev[key] ?? []
                  // Single-select: toggle between [value] and cleared. Multi-select:
                  // add/remove this value from the set. Clicking the badge again undoes it.
                  if (!multi) return { ...prev, [key]: cur.includes(value) ? [] : [value] }
                  return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
                })
              }
              onEdit={() => onEdit(item)}
              onReport={() => onReport(item)}
            />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
