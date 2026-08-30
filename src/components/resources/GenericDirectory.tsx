'use client'

import { useEffect, useRef, useState } from 'react'
import type { DirectoryResource, MapFilters } from '@/types'
import { resolveCapabilities, selectValues, type CategoryConfig } from '@/lib/categories'
import { hoursOpenNow } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { isMinyanim } from '@/lib/davening'
import type { Minyan } from '@/lib/davening'
import DirectoryHeader from './DirectoryHeader'
import CheckboxDropdown from './CheckboxDropdown'
import { GenericListingCard } from './GenericListingCard'
import DaveningTimesModal from '@/components/synagogues/DaveningTimesModal'
import UpButton from '@/components/UpButton'
import { PlusIcon, ClockIcon } from '@/components/icons'
import { useIsMobile } from '@/lib/useIsMobile'
import { listingSearchText } from '@/lib/searchListing'
import { travelCompare } from '@/lib/listingTravel'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { ui } from '@/lib/uiConfig'
import { useCategories } from '@/lib/useCategories'
import { useOptionalLocation } from '@/lib/locationContext'

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
  /** What `onUp` actually goes to — "Home" on mobile (the home grid IS the
   *  index there), "All resources" on desktop (a separate index page). See
   *  FindResources' upToAllResources, which this mirrors. Defaults to "All
   *  resources" for callers (the admin's category preview) that always mean
   *  that literally, regardless of device. */
  upLabel?: string
  onAdd: () => void
  onEdit: (item: DirectoryResource) => void
  onReport: (item: DirectoryResource) => void
  /** Navigate to the map screen pre-filtered to this category. Carries the active
   *  search query and field filters so the map opens showing the same results. */
  onViewMap?: (query?: string, filters?: MapFilters) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GenericDirectory({ category, items, anchorLabel, addressPrompt, reopenItemId, initialSearch, onUp, upLabel = 'All resources', onAdd, onEdit, onReport, onViewMap }: Props) {
  const [search, setSearch] = useState(initialSearch ?? '')
  const [boolFilters, setBoolFilters] = useState<Record<string, boolean>>({})
  // Multi-select: each key maps to the set of chosen values (empty = no filter).
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>({})
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openNow, setOpenNow] = useState(false)
  // Drives the "Open now" filter below. Without it the filter answers for the
  // moment the page rendered, so a list narrowed to what's open at 4pm still
  // shows those places at 10pm.
  const now = new Date(useNow())
  // Distance is meaningless with nothing to measure from, so this tracks the
  // anchor automatically — Popular while there's none, Distance the instant
  // one exists — until the visitor makes an explicit choice below, which
  // then sticks regardless of what the anchor does afterward.
  //
  // Deliberately not a one-time lazy initializer. A saved address (or live
  // tracking resuming) restores from localStorage in a POST-MOUNT effect —
  // see useStoredLocation — so anchorLabel is still empty on this
  // component's very first render even for a returning visitor who already
  // has a location saved. A lazy initializer would freeze on that empty
  // read and this screen would silently default to Popular forever; this
  // effect re-derives the default every time anchorLabel changes instead,
  // so the anchor arriving a beat after mount still flips it.
  const [sortByPopular, setSortByPopular] = useState(!anchorLabel)
  const touchedSort = useRef(false)
  useEffect(() => {
    if (touchedSort.current) return
    setSortByPopular(!anchorLabel)
  }, [anchorLabel])
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [daveningModalOpen, setDaveningModalOpen] = useState(false)
  const isMobile = useIsMobile()
  const categories = useCategories()
  const hasMapCategory = !!categories?.some((c) => c.kind === 'map')

  const fields = category.detailFields
  const tagFields = fields.filter((f) => f.type === 'tags')
  const hoursFields = fields.filter((f) => f.type === 'hours')
  const hasFilterableHours = hoursFields.some((f) => f.filterable)
  const filterableBooleans = fields.filter((f) => f.filterable && f.type === 'boolean')
  const filterableSelects = fields.filter((f) => f.filterable && f.type === 'select')

  // "All davening times" — only for categories with a `minyanim`-type field
  // (today, just Synagogues) and at least one listing with structured data.
  const minyanimField = fields.find((f) => f.type === 'minyanim')
  const hasMinyanim =
    !!minyanimField &&
    items.some((item) => isMinyanim(item[minyanimField.key]) && (item[minyanimField.key] as Minyan[]).length > 0)

  const upvotes = !!category.upvotesEnabled && ui.upvotes
  // Per-category capabilities layered under the global `ui.*` master switches.
  const caps = resolveCapabilities(category.capabilities)
  const canAdd = ui.contributions.add && caps.add
  const showSearch = ui.search.directory && caps.directorySearch
  const liveCount = (item: DirectoryResource) => voteCounts[item.id] ?? item.upvotes ?? 0

  // Every rendered card's row, keyed by listing id — a callback ref rather
  // than a plain array so a card can be found and scrolled to by id after
  // the list re-sorts, not just by its position at mount. Shared by the
  // reopen-on-mount scroll below and the "I'm here" scroll further down.
  const itemRowRefs = useRef(new Map<string, HTMLDivElement>())
  const setItemRowRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) itemRowRefs.current.set(id, el)
    else itemRowRefs.current.delete(id)
  }
  const scrollItemIntoView = (id: string, behavior: ScrollBehavior) => {
    const el = itemRowRefs.current.get(id)
    if (!el) return
    const headerH = (document.querySelector('header')?.getBoundingClientRect().height ?? 64) + 12
    const top = el.getBoundingClientRect().top + window.scrollY - headerH
    window.scrollTo({ top: Math.max(0, top), behavior })
  }

  useEffect(() => {
    if (reopenItemId) scrollItemIntoView(reopenItemId, 'instant')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — only fire on mount

  // Tapping a listing's "I'm here" (see SetLocationButton) re-anchors every
  // distance to it, which — for anyone not already on Distance sort — flips
  // the whole list to Distance and reorders it. On a long list, scrolled deep
  // in, that reorder happens entirely off-screen: the visitor is left looking
  // at whatever listing now occupies the spot they were scrolled to, with no
  // sign their tap did anything. This follows the tapped listing back into
  // view once the reorder actually lands.
  //
  // anchorListingId, not the whole anchor: a typed address or a GPS fix also
  // changes anchorLabel and re-sorts, but there's no single card to return
  // to for those — this is specifically the "I tapped a listing" case.
  const anchorListingId = useOptionalLocation()?.anchorListingId ?? null
  // Skips the very first commit, which is either the initial mount (nothing
  // to follow back to yet) or a returning visitor's already-stored anchor
  // restoring — neither should yank the page to a card the visitor didn't
  // just tap.
  const anchorSettledRef = useRef(false)
  useEffect(() => {
    if (!anchorSettledRef.current) {
      anchorSettledRef.current = true
      return
    }
    if (!anchorListingId) return
    // This commit is the anchor id changing — the sortByPopular effect above
    // (and every card's own distance-label recompute) hasn't reacted to the
    // new anchorLabel yet, so the tapped card's row is still at its OLD
    // position. A fixed delay isn't reliably enough: setting an anchor also
    // stops GPS tracking and touches several other contexts upstream (see
    // setListingAnchor), and their re-renders can land a tick or two apart.
    // Rather than guess a delay, poll until the card's own position has
    // stopped moving for two consecutive checks — i.e. the reorder has
    // actually finished painting — before scrolling to it.
    //
    // setTimeout, not requestAnimationFrame: rAF is paused entirely while the
    // tab is backgrounded, which would silently drop this if the visitor
    // switched apps mid-tap and back.
    let timer = 0
    let lastTop: number | null = null
    let stableChecks = 0
    const waitForSettled = () => {
      const el = itemRowRefs.current.get(anchorListingId)
      if (!el) {
        timer = window.setTimeout(waitForSettled, 32)
        return
      }
      const top = el.getBoundingClientRect().top
      stableChecks = lastTop !== null && Math.abs(top - lastTop) < 0.5 ? stableChecks + 1 : 0
      lastTop = top
      if (stableChecks >= 2) {
        scrollItemIntoView(anchorListingId, 'smooth')
        return
      }
      timer = window.setTimeout(waitForSettled, 32)
    }
    timer = window.setTimeout(waitForSettled, 32)
    return () => window.clearTimeout(timer)
  }, [anchorListingId])

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
        // A select field can hold more than one value on a single item (e.g. a
        // place that's both a Restaurant and a Caterer) — it matches a chosen
        // filter set if ANY of its own values is one of the chosen ones.
        if (chosen?.length && !selectValues(item[f.key]).some((v) => chosen.includes(v))) return false
      }
      if (openNow && hasFilterableHours) {
        // Item must be open right now according to at least one filterable hours field.
        const isOpen = hoursFields
          .filter((f) => f.filterable)
          .some((f) => hoursOpenNow(item[f.key], now) === true)
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

  // Selecting the Popular/Distance toggle. Distance with no anchor set has
  // nothing to sort by (see the sortByPopular default above) — rather than
  // switch to a "Distance" sort that's actually falling back to alphabetical,
  // open the same location picker the header's pill and the map's FAB use,
  // and leave the current sort alone; the untouched-default effect above
  // (still untouched at this point — this click didn't reach the line below)
  // flips it to Distance the moment an anchor lands, same as an ordinary
  // load. An explicit Popular/Distance click marks the choice as touched so
  // it sticks even if the anchor later disappears or reappears.
  const selectSort = (byPopular: boolean) => {
    if (!byPopular && !anchorLabel) {
      document.dispatchEvent(new CustomEvent('jpc:open-location'))
      return
    }
    touchedSort.current = true
    setSortByPopular(byPopular)
  }

  const searchPlaceholder =
    tagFields.length > 0
      ? isMobile
        ? `Search ${category.pluralLabel.toLowerCase()} or items…`
        : `Search ${category.pluralLabel.toLowerCase()} or kosher items (e.g. cheese)…`
      : 'Search…'

  // The toolbar row (filters + sort) only renders when there's something in it;
  // a select needs ≥2 distinct values before it's worth showing.
  const hasRenderedSelects = filterableSelects.some(
    (f) => new Set(items.flatMap((item) => selectValues(item[f.key]))).size >= 2,
  )
  // Whether there's an actual filter control to show — as opposed to
  // `hasFilterRow` below, which also covers the sort toggle/davening button
  // that can appear in this same row without any filter existing at all. Gates
  // the "Filters" toggle button itself so it doesn't show (opening onto an
  // empty panel) for a category with upvotes/minyanim but no filterable field.
  const hasActualFilters = filterableBooleans.length > 0 || hasRenderedSelects || hasFilterableHours
  const hasFilterRow = hasActualFilters || !!upvotes || hasMinyanim

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
      <UpButton label={upLabel} onClick={onUp} />

      <DirectoryHeader
        title={category.pluralLabel}
        count={filtered.length}
        anchorLabel={anchorLabel}
        addressPrompt={addressPrompt}
        actions={
          <>
            {onViewMap && hasMapCategory && category.hasAddress !== false && caps.map && (
              <button
                onClick={() => onViewMap(search.trim() || undefined, mapFilters())}
                /* Desktop only — on mobile the Map button moves into the filter/sort
                   row (next to Filters) to keep the header uncluttered. `desktop:`
                   not `sm:` so a landscape phone doesn't lose it from here only to
                   not have it in the mobile row either — see globals.css. */
                className="hidden desktop:inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
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
          <div className="relative">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {showSearch && q && tagFields.length > 0 && (
          <p className="text-xs text-muted">Showing places matching &ldquo;{search.trim()}&rdquo;</p>
        )}
        {hasFilterRow && (
          <>
            {/* ── Mobile: Filters + Map buttons, then sort toggle — all one line ── */}
            <div className="flex items-center gap-1.5 desktop:hidden">
              {hasActualFilters && (
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
              )}
              {onViewMap && hasMapCategory && category.hasAddress !== false && caps.map && (
                <button
                  onClick={() => onViewMap(search.trim() || undefined, mapFilters())}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  🗺️ Map
                </button>
              )}
              {category.externalLink && (
                <a
                  href={category.externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  {category.externalLink.label} ↗
                </a>
              )}
              {hasMinyanim && (
                <button
                  onClick={() => setDaveningModalOpen(true)}
                  aria-label="All davening times"
                  title="All davening times"
                  className={[
                    'inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap',
                    !upvotes && !category.externalLink ? 'ml-auto' : '',
                  ].join(' ')}
                >
                  <ClockIcon className="h-4 w-4" />
                  {/* Full label once the row has room — hidden below this so it
                      never crowds Filters/Map on the narrowest phones. */}
                  <span className="hidden min-[390px]:inline">All davening times</span>
                </button>
              )}
              {upvotes && (
                <div
                  className={[
                    'flex rounded-md border border-slate-300 overflow-hidden',
                    !hasMinyanim && !category.externalLink ? 'ml-auto' : '',
                  ].join(' ')}
                >
                  {[{ v: true, label: 'Popularity' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => selectSort(opt.v)}
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

            {/* ── Filter controls: collapsible on mobile, always visible on desktop —
                    one horizontally-scrolling line on both, never wrapping to a
                    second row (a wrapped row read as broken/cut-off layout). This
                    same row also carries the desktop versions of external
                    link/davening/sort (their mobile versions are in the row above),
                    so it still renders even with no actual filter — just without a
                    mobile Filters button to open it (that's gated separately). ── */}
            <div
              className={[
                'gap-2 flex-nowrap overflow-x-auto pb-1',
                filtersOpen ? 'flex' : 'hidden',
                'desktop:flex',
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
                const presentValues = Array.from(new Set(items.flatMap((item) => selectValues(item[f.key])))).sort()
                if (presentValues.length < 2) return null
                const chosen = selectFilters[f.key] ?? []
                const toggle = (v: string) =>
                  setSelectFilters((prev) => {
                    const cur = prev[f.key] ?? []
                    return { ...prev, [f.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }
                  })
                // The filter always lets a visitor pick more than one value to
                // filter by, regardless of whether a single listing can hold more
                // than one value (that's `f.multiSelect`, a separate, per-listing
                // setting — see CategoryField.multiSelect).
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
              })}
              {category.externalLink && (
                <a
                  href={category.externalLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden desktop:inline-flex desktop:ml-auto shrink-0 items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  {category.externalLink.label} ↗
                </a>
              )}
              {hasMinyanim && (
                <button
                  onClick={() => setDaveningModalOpen(true)}
                  className={[
                    'hidden desktop:inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap',
                    !upvotes && !category.externalLink ? 'desktop:ml-auto' : '',
                  ].join(' ')}
                >
                  <ClockIcon className="h-4 w-4" />
                  All davening times
                </button>
              )}
              {upvotes && (
                <div
                  className={[
                    'hidden desktop:flex rounded-md border border-slate-300 overflow-hidden shrink-0',
                    !hasMinyanim && !category.externalLink ? 'desktop:ml-auto' : '',
                  ].join(' ')}
                >
                  {[{ v: true, label: 'Popularity' }, { v: false, label: 'Distance' }].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => selectSort(opt.v)}
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
            <div key={item.id} ref={setItemRowRef(item.id)}>
            <GenericListingCard
              item={item}
              category={category}
              showCategoryLabel={false}
              upvotes={upvotes}
              count={liveCount(item)}
              defaultExpanded={item.id === reopenItemId}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [item.id]: c }))}
              onTagClick={setSearch}
              onFilterOpen={() => setOpenNow((v) => !v)}
              onFilterBool={(key) => setBoolFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              onFilterSelect={(key, value) =>
                setSelectFilters((prev) => {
                  const cur = prev[key] ?? []
                  // Add/remove this value from the filter's chosen set. Clicking
                  // the badge again undoes it.
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

      {hasMinyanim && (
        <DaveningTimesModal
          items={items}
          isOpen={daveningModalOpen}
          onClose={() => setDaveningModalOpen(false)}
          initialDenomination={selectFilters['denomination']?.[0] ?? ''}
        />
      )}
    </div>
  )
}
