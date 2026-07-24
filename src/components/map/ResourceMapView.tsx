'use client'

import { useEffect, useMemo, useState } from 'react'
import UpButton from '@/components/UpButton'
import ResourceMap, { type MapPoint } from './ResourceMap'
import CategoryFilter, { type FilterOption } from './CategoryFilter'
import NearbyList from './NearbyList'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { useWatchPosition } from '@/lib/useWatchPosition'
import { useHospitals } from '@/lib/useHospitals'
import type { LatLng } from '@/lib/googleMapsLinks'
import { listingSearchText } from '@/lib/searchListing'
import { hoursOpenNow } from '@/lib/hours'
import { ui } from '@/lib/uiConfig'
import type { DirectoryResource, MapFilters } from '@/types'

// Exported so callers syncing external UI (e.g. the home page's category
// list) with the map's points use the exact same id for hospitals.
export const HOSPITALS_ID = '__hospitals__'
// The approved bright, warm-leaning accent palette — used for map pins,
// category colors, and (cycled) as border colors on buttons/tiles/widgets
// elsewhere (see sections.tsx, CategoryRow.tsx, HospitalRow.tsx,
// ZmanimWidget.tsx). Moderately-to-highly saturated, consistent intensity —
// avoid mixing in muted/desaturated tones outside this set.
export const ACCENT_PALETTE = ['#ffc145', '#df4c73', '#f9a66c', '#aecf80', '#3bba9c', '#6f7bc5']

// Exported so callers coloring external UI to match the map's legend (e.g.
// the home page's category list) use the exact same colors.
export const HOSPITAL_COLOR = '#F08C8C'
const HOSPITAL_ICON = '🏥'

// Fixed display order — Synagogues, Restaurants and Bakeries, Grocery Stores,
// Hospitals, Hotels, Mikvah, then Eruv last (no pins of its own) — shared by
// the map's own bottom key bar (`options` below) and the home page's "Browse
// by Category" sidebar list (Landing.tsx), so the two always agree.
export const MAP_CATEGORY_ORDER = ['synagogue', 'restaurant', 'grocery', HOSPITALS_ID, 'hotel', 'mikvah', 'eruv']
export function rankMapId(id: string): number {
  const index = MAP_CATEGORY_ORDER.indexOf(id)
  return index === -1 ? MAP_CATEGORY_ORDER.length : index
}

// Typing one of these in the search pins the open-now filter (rather than a plain
// text term), so it's entered from the search box like every other chip.
const OPEN_NOW_WORDS = new Set(['open', 'open now', 'opennow', 'open-now'])
const isOpenNowWord = (v: string) => OPEN_NOW_WORDS.has(v.trim().toLowerCase())

// A direct, stable color per category (rather than a cycled palette index) —
// each specific category gets an intentional, permanent color regardless of
// display order. A single-hue tint/shade ramp derived from `#EB6969`, darkest
// (`#E85151`) to lightest (`#F8C7C7`), one step per category in
// MAP_CATEGORY_ORDER order — reverted back to this pinker/brighter-red family
// after a `#700F0F`-anchored darker/browner ramp read as "not pink enough."
// Lightness varies a lot across these, so white text/
// glyphs sitting on a solid fill of one of these colors (Collapsible row
// headers, pin glyphs) can wash out on the paler ones — `Collapsible.tsx`
// picks dark vs. white header text per-accentColor via a relative-luminance
// check to handle this. Pin glyphs are NOT covered by that (still
// unconditionally white in `ResourceMap.tsx`) — a known, separately-flagged
// gap, not addressed here. Keyed by category id for regular listing
// categories; kind: 'medical'/'zmanim'/'eruv'/'map' categories aren't
// uniquely identified by a fixed id the way listing categories are, so eruv
// is matched by kind instead below (hospitals use HOSPITAL_COLOR directly,
// not this dict — see allPoints below).
const CATEGORY_COLORS: Record<string, string> = {
  synagogue: '#E85151',
  restaurant: '#EB6565',
  grocery: '#ED7878',
  // (Hospitals sit here in MAP_CATEGORY_ORDER, using HOSPITAL_COLOR '#F08C8C' itself.)
  hotel: '#F3A0A0',
  mikvah: '#F5B3B3',
}
const ERUV_COLOR = '#F8C7C7'

// Exported so external UI (the home page's category list) computes the exact
// same color as the map's pins for a given category.
export function colorForListingCategory(categories: CategoryConfig[], categoryId: string): string {
  const category = categories.find((c) => c.id === categoryId)
  if (category?.kind === 'eruv') return ERUV_COLOR
  return CATEGORY_COLORS[categoryId] ?? '#64748b'
}

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
  /** Rendered beside the map/nearby panel (not the header above it), so it
   *  top-aligns with the actual map border. Used by the home page's "Browse
   *  by Category" list. */
  sidebar?: React.ReactNode
  /** The id of a single point to isolate on the map (hides every other pin
   *  and force-zooms to it) — set when the visitor taps a facility in
   *  `sidebar`. Controlled from the parent so the same tap can also expand
   *  that facility's row in the list. Takes priority over
   *  `focusedCategoryIds` when both are set. */
  focusedListingId?: string | null
  onFocusListingChange?: (id: string | null) => void
  /** Every category (or `HOSPITALS_ID`) currently isolated on the map — hides
   *  every other pin and zooms to fit the union of these categories' points.
   *  Set is built up as the visitor expands multiple rows in `sidebar` at
   *  once (multi-select), not just the single most-recent one. */
  focusedCategoryIds?: Set<string>
  /** Toggles one category's membership in `focusedCategoryIds` — called by
   *  the map's own bottom key bar (a compact alternative to expanding a row
   *  in `sidebar` just to filter that category), kept in sync with `sidebar`
   *  since both read/write the same `focusedCategoryIds` set. */
  onFocusCategoryChange?: (id: string) => void
  /** The exact point ids currently surviving each isolated category's own
   *  filters (search/open-now/kosher/etc., applied inside `sidebar`), keyed
   *  by that category's map id — when a category has an entry here, its
   *  isolation narrows to just these ids instead of the whole category
   *  (falls back to the whole category meanwhile, before its row has
   *  reported its first filtered set). */
  categoryItemIdsByCategory?: Record<string, string[]>
}

type Tab = 'map' | 'nearby'

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, initialSelectedCategories, initialFilters, onViewListing, sidebar, focusedListingId, onFocusListingChange, focusedCategoryIds, onFocusCategoryChange, categoryItemIdsByCategory }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []
  const { position: livePosition, tracking, error: geoError, start, stop } = useWatchPosition()

  // Live GPS takes priority over the one-shot header location.
  const activeLocation: LatLng | null = livePosition ?? userLocation ?? null

  const [tab, setTab] = useState<Tab>('map')
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
    ;(categories ?? []).forEach((c) => map.set(c.id, colorForListingCategory(categories ?? [], c.id)))
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
    return opts.sort((a, b) => rankMapId(a.id) - rankMapId(b.id))
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

  // Isolating one facility (tapped in `sidebar`) overrides every other filter —
  // show exactly that pin, regardless of category/search/field filters. Isolating
  // one or more whole categories (rows expanded, not a facility within one) is
  // the next priority — show every pin across every selected category, each
  // narrowed further to exactly its own entry in `categoryItemIdsByCategory`
  // once that row has reported its own filtered set (search/open-now/kosher/
  // etc. applied inside the sidebar), so the map always matches whatever's
  // actually showing in the list.
  const focusedPoint = focusedListingId ? allPoints.find((p) => p.id === focusedListingId) : undefined
  // Only isolate when at least one focused id actually has pins — Eruv (a
  // `sidebar` row with no map presence, see Landing.tsx) can be the sole
  // focused id, and isolating on it would filter every point out (an empty
  // but truthy array), wrongly blanking the map instead of leaving it
  // exactly as it was, its intended "expanding this changes nothing on the
  // map" behavior.
  const canIsolateCategories =
    !focusedPoint && focusedCategoryIds && [...focusedCategoryIds].some((id) => allPoints.some((p) => p.filterId === id))
  const focusedCategoryPoints = canIsolateCategories
    ? allPoints.filter((p) => {
        if (!focusedCategoryIds!.has(p.filterId)) return false
        const narrowed = categoryItemIdsByCategory?.[p.filterId]
        return narrowed ? narrowed.includes(p.id) : true
      })
    : undefined

  const visiblePoints = useMemo(() => {
    if (focusedPoint) return [focusedPoint]
    if (focusedCategoryPoints) return focusedCategoryPoints
    return allPoints
      .filter((p) => effectiveSelected.has(p.filterId))
      .filter((p) => activeTerms.every((t) => p.searchText.includes(t)))
      .filter((p) => !p.raw || filterChips.every((c) => c.test(p.raw as DirectoryResource)))
  }, [allPoints, effectiveSelected, activeTerms, filterChips, focusedPoint, focusedCategoryPoints])

  const toggle = (id: string) => {
    onFocusListingChange?.(null)
    const next = new Set(effectiveSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const showAll = () => {
    onFocusListingChange?.(null)
    setSelected(new Set(options.map((o) => o.id)))
  }
  const hideAll = () => {
    onFocusListingChange?.(null)
    setSelected(new Set())
  }

  const loading = listings === null || categories === null

  return (
    <div>
      {/* Home button, title, and the Map/Nearby toggle + live-tracking bar
              below are all standalone-page-only chrome — the home page's
              embedded map (`sidebar` given) drops them: Home is a no-op there
              anyway (see HomeMap.tsx), the title/subtitle just repeated what
              the section is already visually obvious as, and live tracking
              moves to a floating control over the map itself instead (below,
              near `<ResourceMap`). ─────────────────────────────────────────── */}
      {!sidebar && <UpButton label="Home" onClick={onUp} />}

      {!sidebar && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Resource map
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Filter by category, then tap any pin or listing for directions.
          </p>
        </div>
      )}

      {/* ── Live tracking bar + Map/Nearby toggle (same row) — standalone map
              screen only, see note above. ────────────────────────────────── */}
      {!sidebar && !loading && (ui.map.liveTracking || ui.map.nearbyList) && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            {ui.map.liveTracking && (
              tracking ? (
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
              )
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
            <p className="mt-2 text-xs text-slate-400">
              Track your position as you walk — the nearest places update in real time.
            </p>
          )}
          {ui.map.liveTracking && geoError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{geoError}</p>
          )}
        </div>
      )}

      {/* ── Category filter chips (broad filter, above search's narrower text
              filter — a single scroll row so they stay compact). Skipped when
              a `sidebar` is given (the home page): its "Browse by Category"
              list already covers category selection — with per-category
              search/sort/field filters this chip row can't — so showing both
              would just be redundant. The standalone map screen (no sidebar)
              still needs these, since it has no other way to filter. ────── */}
      {!loading && !sidebar && options.length > 0 && (
        <div className="mb-4">
          <CategoryFilter
            options={options}
            selected={effectiveSelected}
            onToggle={toggle}
            onAll={showAll}
            onNone={hideAll}
          />
        </div>
      )}

      {/* ── Search + filters — type a term (Enter to pin it as a chip); typing
              "open now" pins the open-now filter. Filters carried from a category
              show as chips too. Every chip narrows the results. Skipped on the
              home page (a `sidebar` is given): each category row already has
              its own search/filters, so this box would be redundant there —
              the standalone map screen (no sidebar) still needs it. ───────── */}
      {!loading && !sidebar && ui.search.map && (
        <div className="mb-4">
          <input
            type="text"
            placeholder={terms.length ? 'Add another term…' : 'Filter — name, synagogues, kosher food, open now…'}
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

          {hasAnyChip && (
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
          )}

          <p className="mt-1.5 text-xs text-muted">
            {visiblePoints.length} place{visiblePoints.length !== 1 ? 's' : ''} shown
            {(activeTerms.length > 0 || filterChips.length > 0) && ' · filtered'}
          </p>
        </div>
      )}

      {/* ── Map/Nearby panel + sidebar — `relative` so the sidebar (when given)
              can float on top of the map as an overlay panel on lg+ instead of
              sharing its width, letting the map fill the full column. ──────── */}
      <div className="relative">
        <div>
          {/* ── Map view ──────────────────────────────────────────────────── */}
          {tab === 'map' && (
            // No border, and square (not rounded) corners, on the home page's
            // embedded map (`sidebar` given) — it now runs full-bleed to the
            // browser's edges (see Landing.tsx), where a border or a curved
            // corner would just look clipped/cut-off. The standalone /map
            // screen keeps its own border + rounded corners, framing the
            // whole page as a card.
            <div
              className={`h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl ring-1 ring-slate-900/5 flex flex-col ${
                sidebar ? 'sm:rounded-none sm:ring-0' : 'sm:ring-0 sm:border-2 sm:border-[#ffc145]'
              }`}
            >
              <div className="relative min-h-0 flex-1">
                {/* ── Live tracking, floated over the map's own top-left
                        corner instead of a bar above it — home page's
                        embedded map only (see note near the old bar above).
                        No Map/Nearby toggle here since Nearby is dropped
                        for the embedded map — `sidebar`'s own list already
                        covers browsing every listing. ────────────────── */}
                {sidebar && !loading && ui.map.liveTracking && (
                  <div className="absolute left-3 top-3 z-10">
                    {tracking ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#E85151] pl-2.5 pr-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                          </span>
                          Live — updating as you move
                        </span>
                        <button
                          onClick={stop}
                          className="rounded-full bg-[#E85151] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:brightness-110 cursor-pointer"
                        >
                          Stop tracking
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleStart}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#EB6969] px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-110 cursor-pointer"
                      >
                        <span aria-hidden="true">📍</span>
                        Start live tracking
                      </button>
                    )}
                    {geoError && (
                      <p className="mt-2 max-w-[240px] rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">{geoError}</p>
                    )}
                  </div>
                )}
                {/* ── Map key — a compact filter per category, floated over
                        the map's own bottom edge instead of a bar below it,
                        so filtering doesn't require expanding a row in
                        `sidebar`. Reads/writes the exact same
                        `focusedCategoryIds` set as `sidebar`'s own rows, so
                        the two stay in sync in both directions. Inset from
                        the right at lg+ so it stops short of the floating
                        `sidebar` panel (320px wide, plus a gap) instead of
                        running underneath it — below lg the sidebar isn't
                        overlaid on the map at all, so the full width is free.
                        Only shown alongside `sidebar` (the home page's
                        embedded map) — the standalone map screen has no such
                        list to sync with; it keeps its own chip row above
                        instead. ─────────────────────────────────────────── */}
                {!loading && sidebar && options.length > 0 && (
                  <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-1.5 lg:right-[336px]">
                    {options.map((o) => {
                      const active = !!focusedCategoryIds?.has(o.id)
                      return (
                        <button
                          key={o.id}
                          onClick={() => onFocusCategoryChange?.(o.id)}
                          // Interior always stays #fefefe — only the border
                          // carries this category's color (both active and
                          // inactive), per an explicit "keep the inside of
                          // the buttons at fefefe" instruction. Active is
                          // instead signaled by a thicker border + the
                          // category color on the text too.
                          style={{ borderColor: o.color, color: active ? o.color : undefined }}
                          className={`inline-flex items-center gap-1 rounded-full bg-[#fefefe]/85 px-2.5 py-1 text-xs font-medium shadow-md transition-colors cursor-pointer ${
                            active ? 'border-[3px] font-semibold' : 'border-2 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {o.icon && <span aria-hidden="true">{o.icon}</span>}
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {loading ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                    Loading map…
                  </div>
                ) : (
                  <ResourceMap
                    points={visiblePoints}
                    userLocation={activeLocation}
                    follow={follow}
                    onResumeFollow={() => setFollow(true)}
                    onViewListing={onViewListing}
                    square={!!sidebar}
                    hasSidebar={!!sidebar}
                    onMarkerClick={(p) => {
                      // Always opens/scrolls to this facility's card in
                      // `sidebar` too, not just the map's own info window —
                      // expanding its category's row first if it wasn't
                      // already (mirrors how a "jump to" search result
                      // expands a row it isn't already in — see
                      // jumpToMapCategory in Landing.tsx). `onFocusCategoryChange`
                      // TOGGLES, so only call it when the row isn't already
                      // open, or a click on an already-expanded category's
                      // pin would collapse it instead.
                      if (!p.filterId) return
                      if (!focusedCategoryIds?.has(p.filterId)) onFocusCategoryChange?.(p.filterId)
                      onFocusListingChange?.(p.id)
                    }}
                    focusPoints={
                      focusedPoint
                        ? [{ lat: focusedPoint.lat, lng: focusedPoint.lng }]
                        : focusedCategoryPoints
                          ? focusedCategoryPoints.map((p) => ({ lat: p.lat, lng: p.lng }))
                          : null
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Nearby list view ──────────────────────────────────────────── */}
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
        </div>

        {sidebar && (
          // Below lg: a normal block underneath the map, full width. lg+: an
          // overlay panel floating on top of the map's right edge (absolute,
          // out of flow — the map above no longer shares its width with it),
          // inset from the map's own border on all sides (top/right/bottom),
          // so its bottom edge lines up with the map card's own bottom border
          // — the map key (above) is a floating overlay now too, not a
          // separate bar eating into the map's height, so there's no longer
          // anything else to dodge vertically here. The key row instead stays
          // clear of this panel horizontally (`lg:right-[336px]` on the key,
          // matching this panel's own width + gap). Scrolls internally, with
          // an opaque card treatment (background/border/shadow) so it reads
          // clearly over the map tiles beneath it.
          <div className="mt-6 w-full lg:absolute lg:top-4 lg:right-4 lg:bottom-4 lg:z-10 lg:mt-0 lg:w-80 lg:overflow-y-auto lg:rounded-2xl lg:border-2 lg:border-[#700F0F]/50 lg:bg-[#fefefe]/75 lg:p-3 lg:shadow-xl">
            {sidebar}
          </div>
        )}
      </div>
    </div>
  )
}
