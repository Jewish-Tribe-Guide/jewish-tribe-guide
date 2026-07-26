'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import UpButton from '@/components/UpButton'
import ResourceMap, { type MapPoint } from './ResourceMap'
import CategoryFilter, { type FilterOption } from './CategoryFilter'
import NearbyList from './NearbyList'
import MobileNearbySheet, { type MobileNearbySheetHandle } from './MobileNearbySheet'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities } from '@/lib/categories'
import { useWatchPosition } from '@/lib/useWatchPosition'
import { useHospitals } from '@/lib/useHospitals'
import { useIsMobile } from '@/lib/useIsMobile'
import type { LatLng } from '@/lib/googleMapsLinks'
import { listingSearchText } from '@/lib/searchListing'
import { hoursOpenNow } from '@/lib/hours'
import { ui } from '@/lib/uiConfig'
import { SlidersIcon } from '@/components/icons'
import type { DirectoryResource, MapFilters } from '@/types'

const HOSPITALS_ID = '__hospitals__'
const HOSPITAL_COLOR = '#dc2626'
const HOSPITAL_ICON = '🏥'

// Typing one of these in the search pins the open-now filter (rather than a plain
// text term), so it's entered from the search box like every other chip.
const OPEN_NOW_WORDS = new Set(['open', 'open now', 'opennow', 'open-now'])
const isOpenNowWord = (v: string) => OPEN_NOW_WORDS.has(v.trim().toLowerCase())

const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // amber
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#65a30d', // lime
]

type Props = {
  onUp: () => void
  /** Initial location from the header's "Set location" control, if already set. */
  userLocation?: LatLng | null
  /** Pre-select a single category filter on arrival (from a category's "Map" button). */
  initialCategory?: string
  /** Pre-fill the map's own search box on arrival — set when the directory the
   *  visitor came from had an active search (e.g. "insomnia cookies" within
   *  Food Establishments). */
  initialQuery?: string
  /** The exact category selection restored from history (browser back after
   *  the visitor toggled chips on the map itself). Takes precedence over
   *  initialCategory, which only covers the single-category arrival case. */
  initialSelectedCategories?: string[]
  /** Field filters (open-now / kosher / type / …) carried from the directory the
   *  visitor came from, applied to pins and shown as removable chips. */
  initialFilters?: MapFilters
  /** Open a specific listing's detail card in its category directory. */
  onViewListing?: (categoryId: string, listingId: string) => void
}

type Tab = 'map' | 'nearby'

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, initialSelectedCategories, initialFilters, onViewListing }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []
  const { position: livePosition, tracking, error: geoError, start, stop } = useWatchPosition()

  // Live GPS takes priority over the one-shot header location.
  const activeLocation: LatLng | null = livePosition ?? userLocation ?? null

  const [tab, setTab] = useState<Tab>('map')
  // Mobile only — the category chip row moves behind this sheet (see the
  // "Filters" button) so the floating search bar over the map stays compact.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  // Measured px height of the map box — the draggable mobile nearby sheet
  // computes its half/full snap points from this rather than the viewport,
  // since the box itself doesn't always fill the viewport.
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const [mapBoxHeight, setMapBoxHeight] = useState(0)
  useEffect(() => {
    const el = mapBoxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setMapBoxHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Tapping a marker on mobile should raise the bottom sheet's place detail
  // (Google-Maps-app-style) instead of opening the small info-window bubble
  // ResourceMap shows by default — desktop keeps that default.
  const isMobile = useIsMobile()
  const nearbySheetRef = useRef<MobileNearbySheetHandle>(null)
  // follow = map pans with every GPS tick. Turns off automatically when the
  // user manually drags the map (we detect this via the Re-center button press,
  // which flips it back on).
  const [follow, setFollow] = useState(true)

  // When tracking starts, flip into follow mode and show the map.
  const handleStart = () => {
    setFollow(true)
    setTab('map')
    start()
  }

  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c, i) => map.set(c.id, PALETTE[i % PALETTE.length]))
    return map
  }, [categories])

  const allPoints = useMemo(() => {
    // `raw` carries the underlying listing so field filters (open-now / kosher /
    // type) can be applied; hospital pins have none.
    const out: (MapPoint & { filterId: string; searchText: string; raw?: DirectoryResource })[] = []

    // Hospital pins are a patient-oriented overlay — only when that module is on.
    if ((categories ?? []).some((c) => c.kind === 'medical')) {
      for (const h of hospitals) {
        out.push({
          filterId: HOSPITALS_ID,
          id: `hospital:${h.id}`,
          lat: h.latitude,
          lng: h.longitude,
          name: h.name,
          color: HOSPITAL_COLOR,
          glyph: HOSPITAL_ICON,
          categoryLabel: 'Hospital',
          searchText: h.name.toLowerCase(),
        })
      }
    }

    const catById = new Map((categories ?? []).map((c) => [c.id, c]))
    for (const r of listings ?? []) {
      const lat = r.geo?.lat
      const lng = r.geo?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const cat = catById.get(r.category)
      // A category whose Map button capability is off (or that no longer
      // resolves — e.g. a stale/deleted category) never gets pins here, same
      // as it not showing up as a filter chip.
      if (!cat || !resolveCapabilities(cat.capabilities).map) continue
      out.push({
        filterId: r.category,
        id: r.id,
        lat,
        lng,
        name: r.name,
        address: r.address || undefined,
        phone: r.phone,
        color: colorById.get(r.category) ?? '#64748b',
        glyph: cat?.icon ?? DEFAULT_CATEGORY_ICON,
        categoryLabel: cat?.label ?? r.category,
        // Same haystack the category directory searches against (name, address,
        // tags, detail fields) — so a query that matches in the directory
        // matches here too.
        searchText: listingSearchText(r, cat),
        raw: r,
      })
    }
    return out
  }, [listings, categories, colorById, hospitals])

  const options = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const p of allPoints) counts.set(p.filterId, (counts.get(p.filterId) ?? 0) + 1)

    const opts: FilterOption[] = []
    if (counts.get(HOSPITALS_ID)) {
      opts.push({ id: HOSPITALS_ID, label: 'Hospitals', icon: HOSPITAL_ICON, color: HOSPITAL_COLOR, count: counts.get(HOSPITALS_ID)! })
    }
    for (const c of categories ?? []) {
      const count = counts.get(c.id) ?? 0
      if (count === 0) continue
      opts.push({ id: c.id, label: c.pluralLabel, icon: c.icon, color: colorById.get(c.id) ?? '#64748b', count })
    }
    return opts
  }, [allPoints, categories, colorById])

  // initialSelectedCategories (a full toggle set restored from history after
  // browser back) takes precedence over initialCategory (the single-category
  // arrival case from a directory's "Map" button).
  const [selected, setSelected] = useState<Set<string> | null>(
    initialSelectedCategories !== undefined
      ? new Set(initialSelectedCategories)
      : initialCategory
        ? new Set([initialCategory])
        : null,
  )
  const effectiveSelected = useMemo(
    () => selected ?? new Set(options.map((o) => o.id)),
    [selected, options],
  )

  // Search terms shown as removable chips — each is an AND filter (a place shows
  // only if it matches every term against its name / address / tags / detail
  // fields). Pre-filled from a directory's active search on arrival; the term
  // being typed filters live and becomes a chip on Enter.
  const [terms, setTerms] = useState<string[]>(() =>
    (initialQuery ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean),
  )
  const [input, setInput] = useState('')

  const addTerm = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    // "open now" pins the open-now filter instead of a text term.
    if (isOpenNowWord(v)) {
      setOpenNowOn(true)
      setInput('')
      return
    }
    setTerms((prev) => (prev.some((t) => t.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]))
    setInput('')
  }
  const removeTerm = (term: string) => setTerms((prev) => prev.filter((t) => t !== term))

  // The typed-but-not-yet-added text also filters, so results update live — except
  // an "open now" keyword, which becomes the filter on Enter, not a text match.
  const activeTerms = useMemo(() => {
    const live = input.trim()
    const includeLive = live && !isOpenNowWord(live) && !terms.some((t) => t.toLowerCase() === live.toLowerCase())
    return (includeLive ? [...terms, live] : terms).map((t) => t.toLowerCase())
  }, [terms, input])

  // ── Field filters (open-now / kosher / type / …) ─────────────────────────────
  // Held as a serializable spec (also what's persisted to history); carried in
  // from the directory. Predicates below are derived once categories load.
  const [openNowOn, setOpenNowOn] = useState(!!initialFilters?.openNow)
  const [boolFields, setBoolFields] = useState<string[]>(initialFilters?.bool ?? [])
  const [selectFilters, setSelectFilters] = useState<Record<string, string[]>>(initialFilters?.select ?? {})

  // Filterable hours-field keys per category, for the open-now predicate.
  const hoursKeysByCat = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of categories ?? []) {
      m.set(c.id, c.detailFields.filter((f) => f.type === 'hours' && f.filterable).map((f) => f.key))
    }
    return m
  }, [categories])

  // A field's display label, resolved from the category the filters came from.
  const labelForField = (key: string): string => {
    const cat = (categories ?? []).find((c) => c.id === initialCategory)
    const f = cat?.detailFields.find((x) => x.key === key)
    return f?.filterLabel ?? f?.label ?? key
  }

  // Active filter chips: label + predicate + remover. Each is an AND filter; a
  // listing that lacks the field passes (so "Kosher" ignores shuls, etc.).
  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; test: (r: DirectoryResource) => boolean; remove: () => void }[] = []
    if (openNowOn) {
      chips.push({
        id: '__open',
        label: 'Open now',
        test: (r) => {
          const keys = hoursKeysByCat.get(r.category)
          return !keys?.length || keys.some((k) => hoursOpenNow(r[k]) === true)
        },
        remove: () => setOpenNowOn(false),
      })
    }
    for (const field of boolFields) {
      chips.push({
        id: `b:${field}`,
        label: labelForField(field),
        test: (r) => r[field] === undefined || r[field] === true,
        remove: () => setBoolFields((prev) => prev.filter((f) => f !== field)),
      })
    }
    for (const [field, values] of Object.entries(selectFilters)) {
      if (!values.length) continue
      chips.push({
        id: `s:${field}`,
        label: values.join(' / '),
        test: (r) => r[field] === undefined || values.includes(r[field] as string),
        remove: () => setSelectFilters((prev) => { const n = { ...prev }; delete n[field]; return n }),
      })
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNowOn, boolFields, selectFilters, categories, initialCategory, hoursKeysByCat])

  const hasAnyChip = terms.length > 0 || filterChips.length > 0
  const clearAllFilters = () => {
    setTerms([])
    setInput('')
    setOpenNowOn(false)
    setBoolFields([])
    setSelectFilters({})
  }

  // Keep the current history entry in sync with the live terms/filters/selection,
  // so returning via browser Back restores what was actually on screen — not just
  // the snapshot from when the map was first opened (or last touched a chip).
  useEffect(() => {
    const current = window.history.state as { mode?: string } | null
    if (current?.mode !== 'map') return
    const anyFilter = openNowOn || boolFields.length > 0 || Object.keys(selectFilters).length > 0
    history.replaceState(
      {
        ...current,
        mapQuery: terms.join(' ') || undefined,
        mapSelected: selected ? Array.from(selected) : undefined,
        mapFilters: anyFilter
          ? {
              openNow: openNowOn || undefined,
              bool: boolFields.length ? boolFields : undefined,
              select: Object.keys(selectFilters).length ? selectFilters : undefined,
            }
          : undefined,
      },
      '',
    )
  }, [terms, selected, openNowOn, boolFields, selectFilters])

  const visiblePoints = useMemo(() => {
    return allPoints
      .filter((p) => effectiveSelected.has(p.filterId))
      .filter((p) => activeTerms.every((t) => p.searchText.includes(t)))
      .filter((p) => !p.raw || filterChips.every((c) => c.test(p.raw as DirectoryResource)))
  }, [allPoints, effectiveSelected, activeTerms, filterChips])

  const toggle = (id: string) => {
    const next = new Set(effectiveSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const showAll = () => setSelected(new Set(options.map((o) => o.id)))
  const hideAll = () => setSelected(new Set())

  const loading = listings === null || categories === null

  // Removable filter/search-term chips — shared between the desktop search box
  // and the mobile floating one, so the two don't drift out of sync.
  const chipsRow = hasAnyChip && (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {/* Filters carried from the directory (open-now / kosher / type). */}
      {filterChips.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 text-xs font-medium bg-primary/15 text-primary rounded-full pl-2.5 pr-1 py-1"
        >
          {c.label}
          <button
            onClick={c.remove}
            aria-label={`Remove ${c.label} filter`}
            className="hover:bg-primary/25 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      {/* Free-text search terms — same blue as the filter chips. */}
      {terms.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-xs font-medium bg-primary/15 text-primary rounded-full pl-2.5 pr-1 py-1"
        >
          {t}
          <button
            onClick={() => removeTerm(t)}
            aria-label={`Remove ${t}`}
            className="hover:bg-primary/25 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={clearAllFilters}
        className="ml-1 text-xs text-muted underline hover:text-slate-700 cursor-pointer"
      >
        Clear all
      </button>
    </div>
  )

  // How many of the available categories are currently turned off — the badge
  // on the mobile "Filters" button, so it's clear at a glance that the map
  // isn't showing everything.
  const hiddenCategoryCount = options.length - effectiveSelected.size

  return (
    // Mobile: a flex column that grows to fill <main> (itself a flex column —
    // see page.tsx) via flex-1/min-h-0, so the map below can flex-1 to fill
    // everything between the site header and the tab bar with no guessed
    // pixel height. Desktop cancels all of this back to plain block flow,
    // unaffected. ─────────────────────────────────────────────────────────
    <div className="flex flex-1 min-h-0 flex-col sm:flex-none sm:block">
      <div className="hidden sm:block">
        <UpButton label="Home" onClick={onUp} />
      </div>

      {/* ── Header — desktop only. Google Maps doesn't caption its own map,
              and the mobile tab bar already says "Map" — this text just ate
              space better spent on the map. ────────────────────────────── */}
      <div className="mb-4 hidden sm:block">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resource map</h1>
        <p className="mt-1 text-sm text-slate-500">
          Filter by category, then tap any pin or listing for directions.
        </p>
      </div>

      {/* ── Live tracking bar + Map/Nearby toggle (same row) — desktop only.
              On mobile: live-tracking is a FAB on the map itself (see the map
              box below), and the Nearby list — which Google Maps doesn't
              surface as its own toggle either — is off the table for now,
              pending the bottom-sheet redesign that'll bring it back. ────── */}
      {!loading && (ui.map.liveTracking || ui.map.nearbyList) && (
        <div className="mb-4 hidden sm:block">
          <div className="flex items-center justify-between gap-3">
            {ui.map.liveTracking && (
              <div className="hidden sm:block">
              {tracking ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Pulsing indicator */}
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-600 pl-2.5 pr-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                    </span>
                    Live — updating as you move
                  </span>
                  <button
                    onClick={stop}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Stop tracking
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStart}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 cursor-pointer"
                >
                  <span aria-hidden="true">📍</span>
                  Start live tracking
                </button>
              )}
              </div>
            )}

            {/* Map / Nearby tab toggle */}
            {ui.map.nearbyList && (
              <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => setTab('map')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Map
                </button>
                <button
                  onClick={() => setTab('nearby')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'nearby' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Nearby
                </button>
              </div>
            )}
          </div>
          {ui.map.liveTracking && !tracking && (
            <p className="mt-2 hidden text-xs text-slate-400 sm:block">
              Track your position as you walk — the nearest places update in real time.
            </p>
          )}
          {ui.map.liveTracking && geoError && (
            <p className="mt-2 hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:block">{geoError}</p>
          )}
        </div>
      )}

      {/* ── Category filter chips (broad filter, above search's narrower text
              filter — a single scroll row so they stay compact). Desktop only —
              on mobile these move behind the "Filters" button next to the
              search box, opening the same CategoryFilter in a sheet below. ─── */}
      {!loading && options.length > 0 && (
        <div className="mb-4 hidden sm:block">
          <CategoryFilter
            options={options}
            selected={effectiveSelected}
            onToggle={toggle}
            onAll={showAll}
            onNone={hideAll}
          />
        </div>
      )}

      {/* ── Search + filters (desktop) — type a term (Enter to pin it as a
              chip); typing "open now" pins the open-now filter. Filters carried
              from a category show as chips too. Every chip narrows the
              results. ─────────────────────────────────────────────────────── */}
      {!loading && ui.search.map && (
        <div className="mb-4 hidden sm:block">
          <input
            type="text"
            placeholder={terms.length ? 'Add another term…' : "Search name, address, or 'open now'…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTerm(input)
              } else if (e.key === 'Backspace' && !input && terms.length) {
                removeTerm(terms[terms.length - 1])
              }
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {chipsRow}
          <p className="mt-1.5 text-xs text-muted">
            {visiblePoints.length} place{visiblePoints.length !== 1 ? 's' : ''} shown
            {(activeTerms.length > 0 || filterChips.length > 0) && ' · filtered'}
          </p>
        </div>
      )}

      {/* ── Map view. Mobile: full-bleed (breaks out of the page's max-width/
              padding) and fills the rest of the flex column (flex-1) —
              genuinely edge to edge, right up to the header, since search/
              filters now float ON the map instead of pushing it down (see
              below), same as Google Maps. Desktop keeps the boxed 70vh card
              with search/filters above it in normal flow. ────────────────── */}
      {tab === 'map' && (
        <div
          ref={mapBoxRef}
          className="relative left-1/2 flex min-h-[320px] w-screen flex-1 -translate-x-1/2 flex-col overflow-hidden sm:left-0 sm:h-[70vh] sm:min-h-[420px] sm:w-full sm:flex-none sm:translate-x-0 sm:rounded-2xl sm:ring-1 sm:ring-slate-900/5"
        >
          {loading ? (
            <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-slate-100 text-sm text-slate-500">
              Loading map…
            </div>
          ) : (
            <>
              <ResourceMap
                points={visiblePoints}
                userLocation={activeLocation}
                follow={follow}
                onResumeFollow={() => setFollow(true)}
                onViewListing={onViewListing}
                onSelectPoint={isMobile ? (p) => nearbySheetRef.current?.selectPoint(p as typeof visiblePoints[number]) : undefined}
                onBackgroundClick={isMobile ? () => nearbySheetRef.current?.collapse() : undefined}
              />

              {/* ── Floating search + filters (mobile) — laid directly over the
                      map, Google-Maps-style, instead of pushing it down. Category
                      chips tuck behind the "Filters" button (opens the sheet
                      below) so this stays a single compact row. ───────────────── */}
              {ui.search.map && (
                <div
                  className="absolute inset-x-0 top-0 z-10 px-3 pb-2 sm:hidden"
                  style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center rounded-full bg-white px-3.5 py-2.5 shadow-lg">
                      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                      </svg>
                      <input
                        type="text"
                        placeholder={terms.length ? 'Add another term…' : "Search name, address, 'open now'…"}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addTerm(input)
                          } else if (e.key === 'Backspace' && !input && terms.length) {
                            removeTerm(terms[terms.length - 1])
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                    {options.length > 0 && (
                      <button
                        onClick={() => setFilterSheetOpen(true)}
                        aria-label="Filter categories"
                        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg cursor-pointer"
                      >
                        <SlidersIcon className="h-[1.125rem] w-[1.125rem]" />
                        {hiddenCategoryCount > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                            {hiddenCategoryCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  {chipsRow}
                  {(activeTerms.length > 0 || filterChips.length > 0) && (
                    <p className="mt-1.5 inline-block rounded-full bg-white/90 px-2.5 py-1 text-xs text-muted shadow">
                      {visiblePoints.length} place{visiblePoints.length !== 1 ? 's' : ''} shown · filtered
                    </p>
                  )}
                  {ui.map.liveTracking && geoError && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg">{geoError}</p>
                  )}
                </div>
              )}

              {/* Mobile-only tracking FAB — ResourceMap's own re-center pill
                  (bottom-right) takes over automatically once activeLocation
                  is set, so this only needs to cover the "not started yet"
                  state and the explicit stop action. */}
              {/* bottom-[4.75rem]: clears MobileNearbySheet's peek height
                  (64px) + margin, same offset as ResourceMap's own re-center
                  pill uses once tracking is active. */}
              {ui.map.liveTracking && !activeLocation && (
                <button
                  onClick={handleStart}
                  aria-label="Start live tracking"
                  className="absolute bottom-[4.75rem] right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg shadow-md ring-1 ring-slate-900/10 cursor-pointer sm:hidden"
                >
                  <span aria-hidden="true">📍</span>
                </button>
              )}
              {ui.map.liveTracking && tracking && (
                <button
                  onClick={stop}
                  className="absolute bottom-36 right-3 z-10 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md ring-1 ring-slate-900/10 cursor-pointer sm:hidden"
                >
                  Stop tracking
                </button>
              )}

              {/* ── Mobile nearby list — a draggable bottom sheet over the
                      map instead of the desktop Map/Nearby toggle; see
                      MobileNearbySheet for the peek/half/full snap points. ── */}
              {ui.map.nearbyList && (
                <MobileNearbySheet
                  ref={nearbySheetRef}
                  points={visiblePoints}
                  userLocation={activeLocation}
                  onViewListing={onViewListing}
                  categories={categories ?? []}
                  containerHeight={mapBoxHeight}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Nearby list view ─────────────────────────────────────────────────── */}
      {tab === 'nearby' && !loading && ui.map.nearbyList && (
        <>
          {activeLocation ? (
            <p className="mb-3 text-xs text-slate-400">
              Sorted by distance from your location
              {tracking ? ', updating live as you move.' : '.'}
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-400">
              Start live tracking above to sort by distance.
            </p>
          )}
          <NearbyList points={visiblePoints} userLocation={activeLocation} onViewListing={onViewListing} />
        </>
      )}

      {!loading && visiblePoints.length === 0 && (
        <p className="mt-3 text-center text-sm text-slate-500">
          {activeTerms.length > 0 || filterChips.length > 0
            ? 'No places match every filter. Try removing one.'
            : 'No places shown. Turn on a category above to see locations.'}
        </p>
      )}

      {/* ── Mobile filter sheet — the category chip row from the desktop layout,
              reached from the "Filters" button next to the mobile search box. ── */}
      {filterSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-900/40 sm:hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setFilterSheetOpen(false) }}
          role="presentation"
        >
          <div className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Categories</h3>
              <button
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <CategoryFilter
              options={options}
              selected={effectiveSelected}
              onToggle={toggle}
              onAll={showAll}
              onNone={hideAll}
            />
            <button
              onClick={() => setFilterSheetOpen(false)}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
