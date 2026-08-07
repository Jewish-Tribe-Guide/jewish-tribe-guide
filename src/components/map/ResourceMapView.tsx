'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import UpButton from '@/components/UpButton'
import ResourceMap, { type MapPoint } from './ResourceMap'
import CategoryFilter, { type FilterOption } from './CategoryFilter'
import NearbyList from './NearbyList'
import {
  DEFAULT_CATEGORY_FILTER,
  buildFilterChips,
  filterCategoryItems,
  isChipActive,
  toggleChip,
  type CategoryFilterState,
} from '@/components/home/CategoryRow'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { ExternalIcon, PacifierIcon, BedIcon, StarOfDavid, ForkIcon, CartIcon, DropIcon, SchoolIcon } from '@/components/icons'
import { needsDarkText, readableTextOnWhite } from '@/components/Collapsible'
import { eruvim } from '@/data/resources'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { useWatchPosition } from '@/lib/useWatchPosition'
import { useHospitals } from '@/lib/useHospitals'
import type { LatLng } from '@/lib/googleMapsLinks'
import { listingSearchText } from '@/lib/searchListing'
import { hoursOpenNow } from '@/lib/hours'
import { distanceMiles } from '@/lib/geo'
import { ui } from '@/lib/uiConfig'
import type { DirectoryResource, MapFilters, NavigateFn } from '@/types'

// Exported so callers syncing external UI (e.g. the home page's category
// list) with the map's points use the exact same id for hospitals.
export const HOSPITALS_ID = '__hospitals__'
// The approved accent palette — a calming-but-varied ocean/sky blue ramp
// (pale aqua through slate blue, deep navy, azure, light blue, and one
// vivid "pop" blue), used for map pins, category colors, and (cycled) as
// border colors on buttons/tiles/widgets elsewhere (see sections.tsx,
// CategoryRow.tsx, HospitalRow.tsx, ZmanimWidget.tsx). All blue family —
// avoid mixing in hues outside this set. The palest step (`#a8dadc`) is too
// light for white text — see `needsDarkText` in Collapsible.tsx, which every
// caller filling a solid background with one of these should check instead
// of hardcoding a comparison against a specific hex.
export const ACCENT_PALETTE = ['#a8dadc', '#457b9d', '#1d3557', '#5390d9', '#84c5f4', '#3a86ff']

// Brand teal for the embedded (desktop home page) map's live-tracking
// button/badges (see `handleStart`/`tracking` below) — was red, which
// clashed with the rest of the page's teal palette. Independent of the pin
// palette below (that's a live-tracking-only accent, not a category color,
// so it didn't move when the pins went pastel) — was `#5C8A8C`, an earlier
// approximation from before this value was pinned down. A brief unified
// two-state redesign for the filter pills themselves (this same teal for
// their active fill) was tried and then undone on request — those pills are
// back to their per-category pin colors, which is also how they already
// stay in sync with the map's own pin palette without needing anything
// special here.
const FILTER_PILL_ACTIVE = '#3E6E6E'

// Exported so callers coloring external UI to match the map's legend (e.g.
// the home page's category list) use the exact same colors. `#E1BFB7` — a
// pastel terracotta (was `#dc2626`, matching `main`'s hardcoded hospital
// red — reverted back to the pastel on request, applying the color
// palette from explore-new-format-ariel-6). Reserved exclusively for
// hospitals/urgent care — not reused anywhere else on the map or site.
export const HOSPITAL_COLOR = '#E1BFB7'
// The letter "H" (a fixed pin glyph, not the admin-configurable category
// icon — see CATEGORY_GLYPHS below) — same "H for Hospital" convention as
// hospital signage generally.
export const HOSPITAL_ICON = 'H'

// Fixed display order — Synagogues, Restaurants and Bakeries, Grocery Stores,
// Hospitals, Hotels, Mikvah, then Eruv last (no pins of its own) — the order
// the map's own key tabs (`options` below) list in.
export const MAP_CATEGORY_ORDER = ['synagogue', 'restaurant', 'grocery', HOSPITALS_ID, 'hotel', 'mikvah', 'eruv']
export function rankMapId(id: string): number {
  const index = MAP_CATEGORY_ORDER.indexOf(id)
  return index === -1 ? MAP_CATEGORY_ORDER.length : index
}

// Typing one of these in the search pins the open-now filter (rather than a plain
// text term), so it's entered from the search box like every other chip.
const OPEN_NOW_WORDS = new Set(['open', 'open now', 'opennow', 'open-now'])
const isOpenNowWord = (v: string) => OPEN_NOW_WORDS.has(v.trim().toLowerCase())

// Every glyph drawn on top of these gets a darker version of the SAME hue,
// not black — see `glyphTintFor` in ResourceMap.tsx, which derives that
// tint straight from each color below rather than a separate hardcoded dict,
// so the two can never drift out of sync.
// Keyed by category id for regular listing categories; kind:
// 'medical'/'zmanim'/'eruv'/'map' categories aren't uniquely identified
// by a fixed id the way listing categories are, so eruv is matched by
// kind instead below (hospitals use HOSPITAL_COLOR directly, not this
// dict — see allPoints below). Applies the color palette from
// explore-new-format-ariel-6, on request — a fixed pastel per known
// category instead of `getCategoryColor`'s generic position-indexed
// palette or the gradient sweep that replaced it after that.
const CATEGORY_COLORS: Record<string, string> = {
  synagogue: '#E1D3B7', // pastel amber (was teal — swapped with restaurant, on request)
  restaurant: '#B7D7E1', // pastel slate-blue (was teal, then swapped with mikvah, on request)
  grocery: '#D2E1B7', // pastel olive-green
  // (Hospitals sit here in MAP_CATEGORY_ORDER, using HOSPITAL_COLOR itself — exclusive to this category.)
  hotel: '#E1B7D0', // pastel mauve (was slate-blue — swapped with mikvah, on request)
  mikvah: '#B7E1DE', // pastel teal (was slate-blue, then swapped with restaurant, on request)
  childcare: '#E1CBB7', // pastel tan
}
const ERUV_COLOR = '#BCE1B7' // pastel sage

// Exported so external UI (the home page's category list) computes the exact
// same color as the map's pins for a given category. Same colors for the
// embedded home map and the standalone map screen alike — no separate
// gradient treatment for either anymore.
export function colorForListingCategory(categories: CategoryConfig[], categoryId: string): string {
  const category = categories.find((c) => c.id === categoryId)
  if (category?.kind === 'eruv') return ERUV_COLOR
  // `#D4CFC4` — a low-saturation, L80 neutral in the same pastel family as
  // CATEGORY_COLORS, for any category outside the fixed set above (e.g. a
  // future admin-added one) rather than falling back to a plain gray that'd
  // clash with the rest of the palette.
  return CATEGORY_COLORS[categoryId] ?? '#D4CFC4'
}

// Fixed pin glyphs, one per category — deliberately NOT the admin-configurable
// `CategoryConfig.icon` field (that's still used for filter chips/list-row
// icons elsewhere; this only overrides what renders inside the map PIN
// itself). Each renders through `monoGlyphElement` in ResourceMap.tsx, which
// flattens it to a solid white silhouette regardless of source color, so a
// plain letter ("H") and an emoji are handled identically. Colors moved to
// `getCategoryColor` (see above), but this branch's own custom pin-glyph
// shapes are a separate, unrelated concern (glyphs, not colors) — untouched.
const CATEGORY_GLYPHS: Record<string, string> = {
  synagogue: '✡', // Jewish star
  restaurant: '🍴', // fork
  grocery: '🛒', // shopping cart
  // (Hospitals use HOSPITAL_ICON 'H' directly, not this dict.)
  hotel: '🛏️', // bed
  mikvah: '💧', // drop of water
}
// Eruv never has pins of its own (see MAP_CATEGORY_ORDER above) — this is
// unused by any pin today, kept only in case Eruv ever gains a pin
// presence, or another caller wants its fixed glyph.
const ERUV_GLYPH = '🧵' // a string/thread

// Every fixed category's pin now draws through a line-art icon (see
// LINE_ICON_PATHS in ResourceMap.tsx) instead of CATEGORY_GLYPHS' emoji —
// those crush to pure black/white at pin size, which can't produce the
// contrast-aware hue tint every pin color gets (see `glyphTintFor` in
// ResourceMap.tsx). CATEGORY_GLYPHS itself stays populated as a fallback
// (see `allPoints` below) for any category outside this fixed set.
const LINE_ICON_BY_CATEGORY: Partial<Record<string, 'star' | 'fork' | 'cart' | 'drop' | 'pacifier' | 'bed' | 'school'>> = {
  synagogue: 'star',
  restaurant: 'fork',
  grocery: 'cart',
  mikvah: 'drop',
  childcare: 'pacifier',
  hotel: 'bed',
  school: 'school',
}

// The home page's embedded map opens centered here (Spruce Market, 1523
// Spruce St, Rittenhouse Square/Center City) instead of `community.mapCenter`
// — the standalone map screen keeps that broader community-wide default; see
// where this is passed as `fallbackCenter` further down.
const HOME_MAP_CENTER = { lat: 39.9473617, lng: -75.1671603 }

// Exported so external UI could compute the exact same fixed pin glyph as the
// map for a given category, mirroring `colorForListingCategory`.
export function glyphForListingCategory(categories: CategoryConfig[], categoryId: string): string | undefined {
  const category = categories.find((c) => c.id === categoryId)
  if (category?.kind === 'eruv') return ERUV_GLYPH
  return CATEGORY_GLYPHS[categoryId]
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
  /** True for the home page's embedded map — swaps in the map-key's tab/
   *  column browsing UI (live tracking overlay, category tabs down the left
   *  edge with their Miller-columns flyout) in place of the standalone map
   *  screen's own header/search/toggle bar. The embedded map used to also
   *  render a "Browse by Category" list beside it (hence the old prop name,
   *  `sidebar`); that list is gone now that the tab/column UI covers the
   *  same ground directly on the map. */
  embedded?: boolean
  /** The id of a single point to isolate on the map (hides every other pin
   *  and force-zooms to it) — set when the visitor taps a facility in the
   *  map key's flyout. Controlled from the parent so the same tap can also
   *  expand that facility's card in the flyout. Takes priority over
   *  `focusedCategoryIds` when both are set. */
  focusedListingId?: string | null
  onFocusListingChange?: (id: string | null) => void
  /** Every category (or `HOSPITALS_ID`) currently isolated on the map — hides
   *  every other pin and zooms to fit the union of these categories' points.
   *  Set is built up as the visitor opens multiple map-key tabs over time
   *  (multi-select), not just the single most-recent one. */
  focusedCategoryIds?: Set<string>
  /** Toggles one category's membership in `focusedCategoryIds` — called by
   *  the map's own key tabs. */
  onFocusCategoryChange?: (id: string) => void
  /** The exact point ids currently surviving each isolated category's own
   *  filters (search/open-now/kosher/etc., applied inside the map key's
   *  flyout), keyed by that category's map id — when a category has an
   *  entry here, its isolation narrows to just these ids instead of the
   *  whole category (falls back to the whole category meanwhile, before its
   *  flyout has reported its first filtered set). */
  categoryItemIdsByCategory?: Record<string, string[]>
  /** Full navigate function — only needed (and only passed) by the home
   *  page's embedded map, to power the map key's flyout (`onViewListing`
   *  alone only opens one specific listing; the flyout also needs "View
   *  full page" links). */
  onNavigate?: NavigateFn
  /** Listing ids to visually mark (distinct pin border/scale — see
   *  ResourceMap's `highlighted`) without otherwise touching which pins
   *  show — driven by the home page's own top search bar, so a match
   *  there stands out on the map instead of only surfacing in the
   *  separate search-results list below. Only affects pins already
   *  visible under whatever category selection is active; it doesn't
   *  force-reveal a category that's currently filtered out. */
  highlightedListingIds?: Set<string>
}

type Tab = 'map' | 'nearby'

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, initialSelectedCategories, initialFilters, onViewListing, embedded, focusedListingId, onFocusListingChange, focusedCategoryIds, onFocusCategoryChange, categoryItemIdsByCategory, onNavigate, highlightedListingIds }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []
  const { position: livePosition, tracking, error: geoError, start, stop } = useWatchPosition()

  // Live GPS takes priority over the one-shot header location.
  const activeLocation: LatLng | null = livePosition ?? userLocation ?? null

  const [tab, setTab] = useState<Tab>('map')
  // Fullscreen target — everything layered over the map (search bar,
  // category key row, Select/Unselect all, live tracking, the detail
  // panel) AND the map itself all live inside this one div, so
  // fullscreening IT (not just `<ResourceMap>`'s own root, which is only
  // the map canvas) is what keeps every one of those controls visible
  // and usable once fullscreened — the Fullscreen API only shows the
  // fullscreened element and its descendants, and those controls are
  // siblings of `<ResourceMap>`, not children of it. The toggle button
  // itself still renders inside ResourceMap (bottom-right of the map
  // canvas, see `isFullscreen`/`onToggleFullscreen` below) since that's
  // the natural place for it, but the actual fullscreen call targets
  // this ref instead of anything local to that component.
  const mapAreaRef = useRef<HTMLDivElement>(null)
  // Scrolls the merged list (the dropdown hanging off the map's own search
  // bar) to whichever row is focused — a marker click sets `focusedListingId`
  // (see `onMarkerClick` below), and the row for that id should come into
  // view instead of leaving the visitor to hunt for the highlighted item in
  // a scrolled-off part of the list.
  const listRowRefs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (!focusedListingId) return
    listRowRefs.current.get(focusedListingId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedListingId])
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === mapAreaRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else mapAreaRef.current?.requestFullscreen()
  }
  // The map key's own category picker (see below) — a single "Filter
  // categories" dropdown/multi-select (was a horizontal row of pills with
  // scroll chevrons, on request: that overflowed off-screen past a handful
  // of categories, this scales to any number without consuming permanent
  // horizontal space). `categoryPickerRef` + the effect below close it on
  // any click outside, same pattern LocationControl.tsx's popover uses.
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const categoryPickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!categoryPickerOpen) return
    function onDown(e: MouseEvent) {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) setCategoryPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [categoryPickerOpen])

  // Each category's own search/sort/filter state (see CategoryRow), keyed by
  // category id so a category not currently in "filter mode" up top (see
  // below) doesn't lose whatever filters were set on it earlier.
  const [categoryFilters, setCategoryFilters] = useState<Record<string, CategoryFilterState>>({})
  const getCategoryFilters = (id: string) => categoryFilters[id] ?? DEFAULT_CATEGORY_FILTER
  const setCategoryFiltersFor = (id: string, next: CategoryFilterState) =>
    setCategoryFilters((prev) => ({ ...prev, [id]: next }))

  // An empty `focusedCategoryIds` is ambiguous on its own — it's both the
  // untouched starting state (where every pin should still show, see
  // `canIsolateCategories` below) and the result of explicitly clicking
  // "Unselect all" (where NONE should). This tracks which one it is: true
  // only right after Unselect all, reset the moment any category becomes
  // selected again through any path (a button, Select all, or tapping a pin).
  const [categoriesExplicitlyCleared, setCategoriesExplicitlyCleared] = useState(false)

  // Whether the search bar's merged dropdown list sorts by distance from
  // `activeLocation` — off falls back to alphabetical. Starts OFF, not on:
  // there's normally no location yet at all, so defaulting to "on" meant
  // the very first click just turned it back off (a no-op, since the
  // button's own onClick only starts location tracking when switching
  // FROM off TO on) instead of actually kicking off tracking and sorting.
  const [sortByDistance, setSortByDistance] = useState(false)

  // Whether the search bar's own dropdown list is collapsed — a plain
  // visual toggle (an arrow on the search bar itself) independent of which
  // categories are selected, so the visitor can tuck the list away without
  // losing their selection.
  const [listCollapsed, setListCollapsed] = useState(false)

  // When tracking starts, flip into follow mode and show the map.
  const handleStart = () => {
    setTab('map')
    start()
  }

  // Same fixed pastel-per-category palette for the embedded home map and
  // the standalone map screen alike (see `colorForListingCategory` above)
  // — no separate gradient treatment for `embedded` anymore.
  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c) => map.set(c.id, colorForListingCategory(categories ?? [], c.id)))
    return map
  }, [categories])

  // Looked up by the map key's flyout (below) to know which kind of content
  // to render for a given tab.
  const categoryConfigById = useMemo(() => {
    const map = new Map<string, CategoryConfig>()
    ;(categories ?? []).forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const allPoints = useMemo(() => {
    // `raw` carries the underlying listing so field filters (open-now / kosher /
    // type) can be applied; hospital pins have none.
    const out: (MapPoint & { filterId: string; searchText: string; raw?: DirectoryResource })[] = []

    // Hospital pins are a patient-oriented overlay — only when that module is on.
    const medicalCategory = (categories ?? []).find((c) => c.kind === 'medical')
    if (medicalCategory) {
      const hospitalColor = HOSPITAL_COLOR
      for (const h of hospitals) {
        out.push({
          filterId: HOSPITALS_ID,
          id: `hospital:${h.id}`,
          lat: h.latitude,
          lng: h.longitude,
          name: h.name,
          color: hospitalColor,
          // Plain letter, not emoji — gets its exact "darker version of the
          // same hue" tint directly (see `coloredTextGlyphElement` in
          // ResourceMap.tsx) instead of a black/white filter crush.
          textGlyph: HOSPITAL_ICON,
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
        glyph: CATEGORY_GLYPHS[r.category] ?? cat?.icon ?? DEFAULT_CATEGORY_ICON,
        // Every fixed category's pin draws through LINE_ICON_BY_CATEGORY
        // (see its doc comment above) — `glyph` above still carries the
        // emoji as a fallback for any category outside that set, and for
        // any other consumer that only understands the plain glyph string.
        lineIcon: LINE_ICON_BY_CATEGORY[r.category],
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
      // Reads straight off an actual hospital pin (already computed with the
      // right embedded-aware color, see `allPoints`) rather than duplicating
      // that lookup here — keeps the filter pill and the pins it filters
      // perfectly in sync by construction.
      const hospitalColor = allPoints.find((p) => p.filterId === HOSPITALS_ID)?.color ?? HOSPITAL_COLOR
      opts.push({ id: HOSPITALS_ID, label: 'Hospitals', icon: HOSPITAL_ICON, color: hospitalColor, count: counts.get(HOSPITALS_ID)! })
    }
    for (const c of categories ?? []) {
      const count = counts.get(c.id) ?? 0
      if (count === 0) continue
      // Every fixed category uses the same line-art icon here as its map pin
      // does (see LINE_ICON_BY_CATEGORY above / LINE_ICON_PATHS in
      // ResourceMap.tsx) instead of a plain emoji — CATEGORY_GLYPHS/c.icon
      // only remain as a fallback for a category outside that fixed set.
      const icon =
        c.id === 'synagogue' ? (
          <StarOfDavid className="h-3.5 w-3.5" />
        ) : c.id === 'restaurant' ? (
          <ForkIcon className="h-3.5 w-3.5" />
        ) : c.id === 'grocery' ? (
          <CartIcon className="h-3.5 w-3.5" />
        ) : c.id === 'mikvah' ? (
          <DropIcon className="h-3.5 w-3.5" />
        ) : c.id === 'childcare' ? (
          <PacifierIcon className="h-3.5 w-3.5" />
        ) : c.id === 'hotel' ? (
          <BedIcon className="h-3.5 w-3.5" />
        ) : c.id === 'school' ? (
          <SchoolIcon className="h-3.5 w-3.5" />
        ) : (
          (CATEGORY_GLYPHS[c.id] ?? c.icon)
        )
      opts.push({ id: c.id, label: c.pluralLabel, icon, color: colorById.get(c.id) ?? '#64748b', count })
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

  // Isolating one facility (tapped in the map key's flyout) overrides every
  // other filter — show exactly that pin, regardless of category/search/
  // field filters. Isolating one or more whole categories (tabs opened, not
  // a facility within one) is the next priority — show every pin across
  // every selected category, each narrowed further to exactly its own entry
  // in `categoryItemIdsByCategory` once that tab's flyout has reported its
  // own filtered set (search/open-now/kosher/etc. applied inside it), so the
  // map always matches whatever's actually showing in the flyout.
  const focusedPoint = focusedListingId ? allPoints.find((p) => p.id === focusedListingId) : undefined
  // Only isolate when at least one focused id actually has pins — Eruv (a
  // map-key tab with no map presence, see Landing.tsx) can be the sole
  // focused id, and isolating on it would filter every point out (an empty
  // but truthy array), wrongly blanking the map instead of leaving it
  // exactly as it was, its intended "opening this changes nothing on the
  // map" behavior. `categoriesExplicitlyCleared` overrides that guard —
  // Unselect all SHOULD blank the map, even though the resulting empty set
  // looks identical to the untouched-Eruv-only case otherwise.
  const canIsolateCategories =
    !focusedPoint &&
    focusedCategoryIds &&
    (categoriesExplicitlyCleared || [...focusedCategoryIds].some((id) => allPoints.some((p) => p.filterId === id)))
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
  // Marks the home page's own top-search matches distinctly on the map
  // (see ResourceMap's `highlighted`) without touching which pins are
  // actually visible — a separate concern from `activeTerms`, which is
  // the map's OWN internal search/filter, not the home page's.
  // `highlightedKey` (a sorted, joined fingerprint of the id set) — not
  // `highlightedListingIds` itself — drives the memo: the parent rebuilds
  // that Set on every render regardless of whether the actual matches
  // changed, and depending on the Set object directly would rebuild every
  // marker on the map (an expensive Google Maps operation) on every
  // unrelated keystroke/render instead of only when matches actually do.
  const highlightedKey = highlightedListingIds ? [...highlightedListingIds].sort().join(',') : ''
  const highlightedVisiblePoints = useMemo(
    () =>
      highlightedListingIds && highlightedListingIds.size > 0
        ? visiblePoints.map((p) => (highlightedListingIds.has(p.id) ? { ...p, highlighted: true } : p))
        : visiblePoints,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highlightedKey is highlightedListingIds' stable fingerprint, see comment above
    [visiblePoints, highlightedKey],
  )

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

  // ── Map key derived state — computed once here (rather than inside the
  // JSX below) so both the search bar's dropdown and the button/filter row
  // beneath it can share it without recomputing it twice. See the map key's
  // own JSX further down for how each piece renders.
  const openOptions = options.filter((o) => focusedCategoryIds?.has(o.id))
  const focusedItem = focusedListingId
    ? (listings ?? []).find((item) => item.id === focusedListingId && focusedCategoryIds?.has(item.category))
    : undefined
  const focusedItemOption = focusedItem ? options.find((o) => o.id === focusedItem.category) : undefined
  const focusedItemConfig = focusedItem ? categoryConfigById.get(focusedItem.category) : undefined

  const selectTab = (id: string) => {
    onFocusListingChange?.(null)
    const turningOn = !focusedCategoryIds?.has(id)
    onFocusCategoryChange?.(id)
    if (turningOn) setCategoriesExplicitlyCleared(false)
  }

  // `onFocusCategoryChange` only ever toggles ONE id — these just call it
  // once per id that still needs flipping, in the same tick, so the whole
  // set moves to empty/full in one click instead of the user tapping every
  // button.
  const selectAll = () => {
    onFocusListingChange?.(null)
    for (const o of options) {
      if (!focusedCategoryIds?.has(o.id)) onFocusCategoryChange?.(o.id)
    }
    setCategoriesExplicitlyCleared(false)
  }
  const unselectAll = () => {
    onFocusListingChange?.(null)
    for (const id of focusedCategoryIds ?? []) onFocusCategoryChange?.(id)
    setCategoriesExplicitlyCleared(true)
  }

  // Exactly one category selected shows THAT category's own filter buttons
  // (Open Now, boolean/select fields) ALONGSIDE the "Filter categories"
  // dropdown (not swapped in place of it, on request — that used to hide
  // the dropdown entirely the moment a selection narrowed to one category,
  // so there was no way to add a second one without an escape-hatch "‹"
  // button; now the dropdown always stays put). Categories with nothing
  // filterable (hospitals, Eruv) simply have no chips, so this quietly
  // renders nothing extra for them.
  const soleOption = openOptions.length === 1 ? openOptions[0] : undefined
  const soleConfig = soleOption ? categoryConfigById.get(soleOption.id) : undefined
  const soleItems = soleOption ? (listings ?? []).filter((item) => item.category === soleOption.id) : []
  const soleChips = soleConfig ? buildFilterChips(soleConfig, soleItems) : []
  const showFilterBar = !!soleOption && !!soleConfig && soleChips.length > 0

  // Sole-category filter chips ("Open Now", kosher cert, etc. — see
  // `soleChips` above) already scroll sideways on overflow
  // (`overflow-x-auto`, no visible scrollbar); a scroll ARROW next to it is
  // additionally shown once there's actually something to scroll TO, on
  // request, since a hidden scrollbar alone gives no hint more chips exist
  // off the right edge. `chipOverflowing` is re-measured whenever the chip
  // row's own size or content could have changed — the container's own
  // width (ResizeObserver, e.g. the title column drag resizing this whole
  // map) and the chip list itself (a category swap can add/drop chips
  // without the container changing size at all).
  const chipScrollRef = useRef<HTMLDivElement>(null)
  const [chipOverflowing, setChipOverflowing] = useState(false)
  useEffect(() => {
    const el = chipScrollRef.current
    if (!el) {
      setChipOverflowing(false)
      return
    }
    const measure = () => setChipOverflowing(el.scrollWidth > el.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [soleChips.length, soleOption?.id])
  const scrollChips = () => {
    chipScrollRef.current?.scrollBy({ left: 140, behavior: 'smooth' })
  }

  // The dropdown never groups by category — one flat list regardless of
  // whether one or several categories are selected — sorted by distance
  // from `activeLocation` when `sortByDistance` is on and a location is
  // actually known, alphabetically otherwise. Each row still carries its
  // own category's label/color for the subtitle line, so which category it
  // belongs to stays visible without a section header. Eruv isn't real
  // "listings" with coordinates to sort — its static status block still
  // renders as its own section regardless (see the JSX below).
  type MergedRow = { id: string; name: string; categoryId: string; categoryLabel: string; categoryColor: string; milesFromAddress?: number }
  const mergedListRows: MergedRow[] =
    openOptions.length > 0
      ? openOptions.flatMap((opt): MergedRow[] => {
          const config = categoryConfigById.get(opt.id)
          if (opt.id === HOSPITALS_ID) {
            return hospitals.map((h) => ({
              id: `hospital:${h.id}`,
              name: h.name,
              categoryId: opt.id,
              categoryLabel: opt.label,
              categoryColor: opt.color,
              milesFromAddress: activeLocation ? distanceMiles(activeLocation, { lat: h.latitude, lng: h.longitude }) : undefined,
            }))
          }
          if (!config || config.kind === 'eruv') return []
          const items = (listings ?? []).filter((item) => item.category === opt.id)
          return filterCategoryItems(config, items, getCategoryFilters(opt.id)).map((item) => ({
            id: item.id,
            name: item.name,
            categoryId: opt.id,
            categoryLabel: config.label,
            categoryColor: opt.color,
            milesFromAddress: activeLocation && item.geo ? distanceMiles(activeLocation, item.geo) : undefined,
          }))
        }).sort((a, b) =>
          sortByDistance && activeLocation
            ? (a.milesFromAddress ?? Infinity) - (b.milesFromAddress ?? Infinity) || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name),
        )
      : []
  const mergedEruvOption = openOptions.find((o) => categoryConfigById.get(o.id)?.kind === 'eruv')

  // How much of the map's own left edge the map key's floating panels
  // currently cover — 264px for the search bar's dropdown alone (`left-2`
  // + `w-64`), another 320px (`w-80`) once the detail panel opens flush
  // beside it. Passed to ResourceMap so it can center a focused pin in the
  // space actually still visible instead of dead-center under the overlay.
  const mapKeyLeftInsetPx = !embedded || openOptions.length === 0 ? 0 : focusedItem && focusedItemConfig ? 264 + 320 : 264

  return (
    <div>
      {/* Home button, title, and the Map/Nearby toggle + live-tracking bar
              below are all standalone-page-only chrome — the home page's
              embedded map (`embedded`) drops them: Home is a no-op there
              anyway (see HomeMap.tsx), the title/subtitle just repeated what
              the section is already visually obvious as, and live tracking
              moves to a floating control over the map itself instead (below,
              near `<ResourceMap`). ─────────────────────────────────────────── */}
      {!embedded && <UpButton label="Home" onClick={onUp} />}

      {!embedded && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-[#2D3636]">
            Resource map
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Filter by category, then tap any pin or listing for directions.
          </p>
        </div>
      )}

      {/* ── Live tracking bar + Map/Nearby toggle (same row) — standalone map
              screen only, see note above. ────────────────────────────────── */}
      {!embedded && !loading && (ui.map.liveTracking || ui.map.nearbyList) && (
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
                    tab === 'map' ? 'bg-white text-[#2D3636] shadow-sm' : 'text-slate-500 hover:text-[#2D3636]'
                  }`}
                >
                  Map
                </button>
                <button
                  onClick={() => setTab('nearby')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                    tab === 'nearby' ? 'bg-white text-[#2D3636] shadow-sm' : 'text-slate-500 hover:text-[#2D3636]'
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
              `embedded` (the home page): its own key tabs already cover
              category selection — with per-category search/sort/field
              filters in their flyout this chip row can't — so showing both
              would just be redundant. The standalone map screen (not
              embedded) still needs these, since it has no other way to
              filter. ──────────────────────────────────────────────────── */}
      {!loading && !embedded && options.length > 0 && (
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
              show as chips too. Every chip narrows the results. Skipped when
              `embedded` (the home page): each tab's own flyout already has
              its own search/filters, so this box would be redundant there —
              the standalone map screen (not embedded) still needs it. ────── */}
      {!loading && !embedded && ui.search.map && (
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
                className="ml-1 text-xs text-muted underline hover:text-[#2D3636] cursor-pointer"
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

      {/* ── Map/Nearby panel — the "Browse by Category" sidebar that used to
              share this row is gone; the map now takes the full width. ──── */}
      <div>
        {/* ── Map view ──────────────────────────────────────────────────── */}
        {tab === 'map' && (
          // The standalone /map screen keeps its own bordered/rounded card
          // look, sized to a comfortable chunk of the page. The home
          // page's embedded map (`embedded`) is square-cornered instead —
          // it extends flush to the edges of its own section (see the
          // call site in Landing.tsx), which already supplies the square
          // black border framing the page, so a separate rounded card
          // here would just be a redundant, disconnected-looking shape
          // inside it. It's `h-[60vh]` (about two-thirds of the previous
          // `h-[90vh]`) so the home page's map section takes up a large
          // but no longer near-full-screen chunk of the viewport while
          // it's scrolled into view.
          <div
            className={`w-full overflow-hidden flex flex-col ${
              embedded
                ? 'h-[60vh]'
                : 'h-[70vh] min-h-[420px] rounded-2xl ring-1 ring-slate-900/5 sm:ring-0 sm:border-2 sm:border-[#ffc145]'
            }`}
          >
              <div ref={mapAreaRef} className="relative min-h-0 flex-1 bg-white">
                {/* ── Live tracking, floated over the map's own bottom-left
                        corner instead of a bar above it — home page's
                        embedded map only (see note near the old bar above).
                        No Map/Nearby toggle here since Nearby is dropped
                        for the embedded map — the map key's own tabs already
                        cover browsing every listing. Sized to match
                        `ResourceMap.tsx`'s own "Re-center" pill instead of
                        its previous compact `text-[10px]` treatment, on
                        request, so every bottom-of-map control reads as one
                        consistent button size — then both scaled down
                        another ~10% together on request (`px-3 py-2
                        text-sm` -> `px-[11px] py-[7px] text-[13px]`). ── */}
                {embedded && !loading && ui.map.liveTracking && (
                  <div className="absolute left-3 bottom-3 z-10 flex flex-col items-start">
                    {/* Red used to signal "recording"/"live" the way it
                        does elsewhere (video, broadcast) — but next to the
                        rest of this page's teal palette it just read as
                        clashing, not purposeful. `FILTER_PILL_ACTIVE`
                        (same saturated teal the filter pills' active state
                        uses) instead, on request — the pulsing dot still
                        does the "this is live" signaling on its own. */}
                    {tracking ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full pl-[9px] pr-[11px] py-[7px] text-[13px] font-semibold text-white shadow-sm"
                          style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                        >
                          <span className="relative flex h-[9px] w-[9px]">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white" />
                            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-white" />
                          </span>
                          Live — updating as you move
                        </span>
                        <button
                          onClick={stop}
                          className="rounded-full px-[11px] py-[7px] text-[13px] font-medium text-white shadow-sm hover:brightness-110 cursor-pointer"
                          style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                        >
                          Stop tracking
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleStart}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-[11px] py-[7px] text-[13px] font-semibold text-white shadow-md hover:brightness-110 cursor-pointer"
                        style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                      >
                        Start live tracking
                      </button>
                    )}
                    {geoError && (
                      <p className="mt-2 max-w-[240px] rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-700 shadow-sm">{geoError}</p>
                    )}
                  </div>
                )}
                {/* ── Search bar, floating near the map's own top-left corner
                        — rounded pill shape with a soft shadow, matching the
                        "What are you looking for?" search bar higher up the
                        page (same border/shadow treatment, just scaled down
                        for this corner). Reuses the exact same term state
                        (`input`/`terms`/`addTerm`/`removeTerm`) the
                        standalone map screen's own search box drives, so
                        typing here narrows `visiblePoints` (and the pins)
                        the same way. Only shown when `embedded`; the
                        standalone screen keeps its fuller search +
                        filter-chip bar above the map instead. `w-64` — twice
                        its original `w-32` — the map key row below (see
                        `left-72`) leaves it the room to match.

                        The merged category list (`openOptions`) now hangs
                        directly off the BOTTOM of this bar instead of
                        living down at the map's left edge — same `w-64`
                        width, flush underneath with no gap (a plain
                        `flex-col`, not separately positioned). The pill
                        itself KEEPS its own full rounded outline/border at
                        all times instead of squaring off while open —
                        floats over the top of the dropdown rather than
                        fusing into it, so it always still reads as its own
                        distinct search-bar shape (same idea as Google
                        Maps' search box staying a whole pill above a
                        filter panel dropped below it), with the dropdown's
                        own separate border/shadow doing the rest of the
                        framing. Fixed `h-8` (rather than letting padding +
                        the input's line-height decide it) — matches the
                        Select all/category buttons' own height (see
                        below) — so the dropdown directly below always
                        starts at exactly `top-2 + h-8` = `top-10` — the
                        detail panel over on the right is pinned to that
                        same `top-10`, so the two dropdowns' own top edges
                        always land in the same place instead of drifting
                        apart by whatever the pill's content height
                        happened to be. `top-2` becomes `top-8` while
                        `isFullscreen` (true Fullscreen API mode, see
                        `mapAreaRef`/`onToggleFullscreen`) — on request,
                        since `top-2` sat flush against the actual screen
                        edge there with no browser chrome above it to
                        provide breathing room the way there normally is.
                        The detail panel's own `top-10`/`top-16` (below)
                        moves by that same delta so the two stay aligned. ─ */}
                {!loading && embedded && (
                  <div className={`absolute left-2 z-20 flex w-64 flex-col ${isFullscreen ? 'top-8' : 'top-2'}`}>
                    {/* `h-8` (was `h-6`) — matches the Select all/Unselect
                        all/category buttons' own explicit `h-8` below, so
                        the two rows share one exact, deterministic height
                        instead of hoping their independently-computed
                        auto-heights happen to line up. Bumped from `h-6` on
                        request (every map control here was "really small").
                        Every dependent offset below (`top-10` on the detail
                        panel) is `top-2 + h-8` = 8px + 32px = 40px,
                        recomputed for this new height. */}
                    <div className="flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                      </svg>
                      <input
                        type="text"
                        placeholder={terms.length ? 'Add term…' : 'Search map…'}
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
                        className="min-w-0 flex-1 bg-transparent text-sm text-[#2D3636] placeholder:text-slate-500 focus:outline-none"
                      />
                      {/* Collapses the dropdown list below without touching
                          which categories are selected — a plain visual
                          toggle, independent of `focusedCategoryIds`. Only
                          shown when there's actually a list to collapse. */}
                      {openOptions.length > 0 && (
                        <button
                          onClick={() => setListCollapsed((v) => !v)}
                          aria-label={listCollapsed ? 'Show list' : 'Hide list'}
                          className="flex shrink-0 h-4 w-4 items-center justify-center text-slate-500 hover:text-[#2D3636] cursor-pointer"
                        >
                          <svg
                            className={`h-3 w-3 transition-transform duration-200 ${listCollapsed ? '-rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {onNavigate && openOptions.length > 0 && !listCollapsed && (
                      <div
                        className={`max-h-64 w-64 overflow-y-auto rounded-2xl border border-slate-200 bg-[#fefefe] p-1.5 shadow-[0_6px_20px_rgb(0,0,0,0.06)] ${
                          // Flush against the detail panel with no seam
                          // between them when a listing's open there —
                          // squares off BOTH right corners (the detail panel
                          // is taller than this dropdown ever gets, so its
                          // whole right edge borders it, top to bottom) and
                          // drops the border there, instead of the two
                          // reading as separate floating pieces with a
                          // dividing line down the middle.
                          focusedItem ? 'rounded-r-none border-r-0' : ''
                        }`}
                      >
                        {/* ── Sort-by-distance toggle — pinned above the
                                list itself so it's clear it controls the
                                whole merged list, not any one category
                                within it. Off falls back to alphabetical
                                (see `mergedListRows` above). Turning it ON
                                also starts location tracking (same `start()`
                                the "Start live tracking" button calls) when
                                it isn't already running — sorting by
                                distance is meaningless without a location to
                                measure from, so this button doubles as the
                                way to get one instead of silently no-op'ing
                                until the visitor separately starts tracking
                                elsewhere. ───────────────────────────────── */}
                        <button
                          onClick={() => {
                            setSortByDistance((v) => {
                              const next = !v
                              if (next && !tracking) start()
                              return next
                            })
                          }}
                          className={`mb-1 rounded-full border-2 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                            sortByDistance ? 'border-[#df4c73] bg-[#df4c73] text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Sort by distance
                        </button>
                        {/* ── One flat list regardless of how many
                                categories are selected — sorted by
                                distance or alphabetically (see
                                `mergedListRows` above) instead of grouped
                                into per-category sections with their own
                                heading. Each row's own subtitle still names
                                its category, so which one it belongs to
                                doesn't disappear just because the grouping/
                                heading does. Eruv isn't a sortable
                                "listing" — its static status block still
                                gets its own small section underneath,
                                whether it's the only thing selected or one
                                of several. ──────────────────────────────── */}
                        <ul className="space-y-0.5">
                          {mergedListRows.map((row) => {
                            const isFocused = row.id === focusedListingId
                            const subtitle = [row.categoryLabel, row.milesFromAddress != null ? `${row.milesFromAddress.toFixed(1)} mi` : null]
                              .filter(Boolean)
                              .join(' · ')
                            return (
                              <li
                                key={row.id}
                                ref={(el) => {
                                  if (el) listRowRefs.current.set(row.id, el)
                                  else listRowRefs.current.delete(row.id)
                                }}
                              >
                                <button
                                  onClick={() => onFocusListingChange?.(isFocused ? null : row.id)}
                                  style={
                                    {
                                      // Darkened toward black until it clears 4.5:1 against
                                      // the white/slate-100 row background (same helper the
                                      // sole-category filter bar already uses below) — the
                                      // gradient palette's paler categories were rendering
                                      // this raw, too light to read once selected, on report.
                                      '--accent': readableTextOnWhite(row.categoryColor),
                                      ...(isFocused ? { color: 'var(--accent)' } : {}),
                                    } as React.CSSProperties
                                  }
                                  className={`group block w-full rounded px-1 py-1 text-left transition-colors cursor-pointer hover:text-[var(--accent)] ${
                                    isFocused ? 'bg-slate-100' : 'text-[#2D3636] hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="block truncate text-xs font-medium">{row.name}</span>
                                  {subtitle && (
                                    <span className="block truncate text-[11px] font-normal text-slate-400 group-hover:text-[var(--accent)]">
                                      {subtitle}
                                    </span>
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                        {mergedEruvOption && (
                          <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
                            <button
                              onClick={() => onNavigate('patient', 'find', { findView: 'eruv' })}
                              style={{ color: mergedEruvOption.color }}
                              className="truncate text-xs font-semibold hover:underline cursor-pointer"
                            >
                              {mergedEruvOption.label}
                            </button>
                            <div className="space-y-2">
                              {eruvim.map((eruv) => (
                                <div key={eruv.id} className="border-2 border-slate-300 bg-white px-2.5 py-2">
                                  <p className="text-xs font-semibold text-[#2D3636]">{eruv.name}</p>
                                  <p className="text-xs text-muted mb-1.5">{eruv.area}</p>
                                  <a
                                    href={eruv.statusLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    Check status &amp; boundary map <ExternalIcon />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* ── Map key — a "Filter categories" dropdown running along
                        the map's own top edge instead of down its left side,
                        top-aligned with the search bar right beside it
                        (`top-2` on both) rather than starting at the very
                        left edge — `left-72` leaves the search bar
                        (`left-2 w-64`) its own room instead of the trigger
                        button running underneath it. Was a horizontal row of
                        pill buttons with scroll chevrons on either edge —
                        replaced with a single compact trigger that expands a
                        checkbox-list panel below it on click (closes on any
                        click outside — see `categoryPickerOpen` above,
                        matching LocationControl.tsx's own popover), on
                        request: the old row overflowed off-screen past a
                        handful of categories and needed a permanent scroll
                        affordance to reach the rest, where this scales to any
                        number of categories without consuming permanent
                        horizontal space. Checking a box TOGGLES that category
                        into `focusedCategoryIds` — the same set that isolates
                        pins on the map — so multiple can be checked at once,
                        filtering the map to their union, same as the old
                        pills did. Every active category's items merge into
                        ONE flat list hanging off the search bar (see below),
                        regardless of how many categories are selected.
                        Clicking a listing inside it opens a detail panel
                        flush beside IT. Only shown when `embedded` (the home
                        page) — the standalone map screen keeps its own chip
                        row above
                        instead. ─────────────────────────────────────────── */}
                {!loading && embedded && options.length > 0 && (
                    <>
                      {/* ── Select all / Unselect all — locked in place
                              OUTSIDE either mode below (filter chips or the
                              category list), so they stay visible and act on
                              every category at once regardless of whether a
                              single category's own filters are currently
                              showing here instead of the category buttons.
                              `top-2` becomes `top-8` in true Fullscreen API
                              mode (see the search bar wrapper's own doc
                              comment above) — same reasoning, on request.
                              Every button directly on the map — this row,
                              "Filter categories" beside it, Re-center/reset
                              view/fullscreen in the map's own corners, and
                              the live-tracking cluster (all in
                              ResourceMap.tsx/further below) — is sized
                              about 10% down from its previous size here, on
                              request (`h-8`/`h-9` -> `h-[29px]`/`h-8`,
                              `px-3` -> `px-[11px]`, `text-sm` ->
                              `text-[13px]`, etc.). ────────────────────── */}
                      <div className={`absolute left-72 right-12 z-20 flex items-center gap-1 ${isFullscreen ? 'top-8' : 'top-2'}`}>
                      {/* ── "Filter categories" dropdown — moved to the front
                              of this row (was after Select all/Unselect all),
                              on request, so it sits directly between the
                              "Search map…" box and Select all. Compact
                              trigger button (same `h-8` row as Select all/
                              Unselect all beside it) that expands a
                              checkbox-list panel below it on click, styled
                              like the search bar's own merged-list dropdown
                              (`rounded-2xl border border-slate-200
                              bg-[#fefefe]` + the same box shadow) — was a
                              horizontal row of individually-colored pill
                              buttons with scroll chevrons, on request:
                              replacing it with one small control that
                              doesn't grow with the category count. Always
                              rendered now, regardless of selection count
                              (used to get swapped out entirely by the
                              sole-category filter-chip bar below the moment
                              exactly one category was selected, on request —
                              that left no way to add a second category
                              without an escape-hatch "‹" button; removed
                              that swap so both can show at once instead).
                              `relative` on this wrapper anchors the panel's
                              `absolute` position; `categoryPickerRef` is
                              what the click-outside effect above checks
                              against. ─────────────────────────────────── */}
                      <div className="relative" ref={categoryPickerRef}>
                        <button
                          onClick={() => setCategoryPickerOpen((v) => !v)}
                          aria-expanded={categoryPickerOpen}
                          className="inline-flex shrink-0 h-[29px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-300 bg-white px-[11px] text-[13px] font-medium text-[#2D3636] shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
                        >
                          Filter categories{focusedCategoryIds?.size ? ` (${focusedCategoryIds.size})` : ''}
                          <svg
                            className={`h-[11px] w-[11px] shrink-0 transition-transform duration-200 ${categoryPickerOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {categoryPickerOpen && (
                          <div className="absolute left-0 top-10 z-30 max-h-72 w-64 overflow-y-auto rounded-2xl border border-slate-200 bg-[#fefefe] p-2 shadow-[0_6px_20px_rgb(0,0,0,0.06)]">
                            <ul className="space-y-1">
                              {options.map((o) => {
                                const checked = focusedCategoryIds?.has(o.id) ?? false
                                return (
                                  <li key={o.id}>
                                    {/* Checking/unchecking calls the exact same
                                        `selectTab` the old pill buttons did —
                                        multiple can be checked at once, unioning
                                        the map filter, same behavior as before. */}
                                    <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm font-medium text-[#2D3636] hover:bg-slate-50">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => selectTab(o.id)}
                                        className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[var(--accent)] cursor-pointer"
                                        style={{ '--accent': o.color } as React.CSSProperties}
                                      />
                                      {/* Small color swatch — the same per-category
                                          color the pin/checkbox accent use, so this
                                          list still reads as color-coded like the
                                          old pill row did, without needing every
                                          row filled solid to show it. */}
                                      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                                      {o.icon && <span aria-hidden="true">{o.icon}</span>}
                                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                                    </label>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                        <button
                          onClick={selectAll}
                          disabled={options.every((o) => focusedCategoryIds?.has(o.id))}
                          className="inline-flex shrink-0 h-[29px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-[11px] text-[13px] font-medium text-[#2D3636] shadow-sm transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Select all
                        </button>
                        <button
                          onClick={unselectAll}
                          disabled={!focusedCategoryIds || focusedCategoryIds.size === 0}
                          className="inline-flex shrink-0 h-[29px] items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-[11px] text-[13px] font-medium text-[#2D3636] shadow-sm transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Unselect all
                        </button>
                      {showFilterBar && soleOption && soleConfig && (
                        /* ── Sole-category filter-chip bar — additionally
                                shown (not swapped in, see above) whenever
                                exactly one category is selected, so filtering
                                it (denomination, Open Now, etc.) doesn't
                                require digging into the dropdown above.
                                Buttons sized down ~10% along with every
                                other map button, on request (`h-8` ->
                                `h-[29px]`, `px-3` -> `px-[11px]`, `text-sm`
                                -> `text-[13px]`). Split into a scrollable
                                inner div (`chipScrollRef`, still
                                `overflow-x-auto`/no visible scrollbar) plus
                                a `shrink-0` scroll-arrow button as its flex
                                sibling — not absolutely positioned over it —
                                so the scrollable area's own `min-w-0`
                                naturally crops its last chip short of the
                                arrow instead of the two overlapping. The
                                arrow only renders once there's actually
                                overflow to scroll to (`chipOverflowing`, see
                                above) and sits right where the row already
                                ends (`right-12` on the outer wrapper), i.e.
                                right next to the map's own zoom control, on
                                request. ─────────────────────────────────── */
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <div
                            ref={chipScrollRef}
                            className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          >
                          {/* Was paired with a "‹ Back to categories" button
                              — no longer needed now that the dropdown above
                              is always visible on its own. Clicking this
                              still doubles as an "unselect" control, same as
                              unchecking it in the dropdown does. */}
                          <button
                            onClick={() => selectTab(soleOption.id)}
                            aria-label={`Unselect ${soleOption.label}`}
                            style={{ backgroundColor: soleOption.color }}
                            className={`inline-flex shrink-0 h-[29px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-[11px] text-[13px] font-medium shadow-md cursor-pointer ${
                              needsDarkText(soleOption.color) ? 'text-black' : 'text-white'
                            }`}
                          >
                            {soleOption.icon && (
                              // Same flat monochrome-silhouette treatment as the
                              // pin glyph itself (see monoGlyphElement in
                              // ResourceMap.tsx), crushed to whichever of
                              // black/white actually reads against this
                              // category's own fill color — same
                              // `needsDarkText` check the pin makes.
                              <span
                                aria-hidden="true"
                                style={{ filter: needsDarkText(soleOption.color) ? 'brightness(0)' : 'brightness(0) invert(1)' }}
                              >
                                {soleOption.icon}
                              </span>
                            )}
                            {soleOption.label}
                          </button>
                          {soleChips.map((chip) => {
                            const currentFilters = getCategoryFilters(soleOption.id)
                            const active = isChipActive(chip, currentFilters)
                            return (
                              <button
                                key={chip.id}
                                onClick={() => setCategoryFiltersFor(soleOption.id, toggleChip(chip, currentFilters, soleConfig))}
                                style={
                                  active
                                    ? { backgroundColor: soleOption.color }
                                    : { borderColor: soleOption.color, color: readableTextOnWhite(soleOption.color) }
                                }
                                className={`inline-flex shrink-0 h-[29px] items-center justify-center whitespace-nowrap rounded-full border-2 px-[11px] text-[13px] font-medium shadow-sm transition-colors cursor-pointer ${
                                  active ? (needsDarkText(soleOption.color) ? 'text-black' : 'text-white') : 'bg-white hover:bg-slate-50'
                                }`}
                              >
                                {chip.label}
                              </button>
                            )
                          })}
                          </div>
                          {chipOverflowing && (
                            <button
                              onClick={scrollChips}
                              aria-label="Scroll filters"
                              // `mr-2` — was flush against the map's own
                              // zoom control (`right-12` on the outer
                              // wrapper left just ~2px of clearance, close
                              // enough to read as overlapping), on request.
                              className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#2D3636] shadow-md ring-1 ring-slate-900/10 cursor-pointer transition-colors hover:bg-slate-50"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                      </div>

                      {/* ── Detail panel — full detail for whatever listing
                              is focused in the search bar's dropdown, instead
                              of expanding inline there. Only for real
                              listings (not hospitals — the lookup above only
                              ever matches `listings`, and hospital ids are
                              `hospital:<id>`, never in that list, so
                              `focusedItem` stays undefined there). Matches
                              the dropdown's own graphics — same `w-64`
                              width, same border/shadow, same `rounded-2xl`
                              radius on every corner except the one touching
                              the dropdown — AND sits flush against it with
                              no gap/border on that shared edge
                              (`left-[16.5rem]` = the dropdown's `left-2` +
                              `w-64`, exactly its right edge), so the two
                              read as one connected shape. `[&_*]:text-xs`
                              forces every text node inside the card up to
                              match the dropdown's own row-name size (was
                              `text-[10px]`, on request — this panel read
                              noticeably smaller than the dropdown feeding
                              it) — `dense` alone (GenericListingCard's
                              smallest built-in mode) doesn't hit any
                              specific size on its own, and Tailwind's own
                              text-size classes don't inherit from an
                              ancestor's font-size the way plain CSS would,
                              so overriding every descendant directly is the
                              only way to actually match it. A small chevron
                              button (passed in as `leadingIcon` — see
                              GenericListingCard) collapses the panel back
                              (clears `focusedListingId`) once the visitor's
                              done with it, instead of only closing via
                              re-clicking the same dropdown row. It sits
                              beside just the place's own title/name row
                              (only that row indents to make room for it) —
                              everything else in the card keeps starting
                              flush at the card's own left edge, same as the
                              button's own left edge, instead of the whole
                              card shifting right underneath it too.
                              `top-10` becomes `top-16` in true Fullscreen
                              API mode, moving by the same delta as the
                              search bar wrapper above (`top-2`->`top-8`)
                              so the two stay aligned — on request. */}
                      {onNavigate && focusedItemConfig && (
                        <div
                          className={`absolute left-[16.5rem] ${isFullscreen ? 'top-16' : 'top-10'} bottom-3 z-10 overflow-hidden rounded-2xl rounded-tl-none border border-l-0 border-slate-200 bg-[#fefefe] shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-[width] duration-300 ease-in-out ${
                            focusedItem ? 'w-64' : 'w-0 border-0'
                          }`}
                        >
                          <div className="h-full w-64 overflow-y-auto p-3 text-xs [&_*]:text-xs">
                            {focusedItem && focusedItemOption && (
                              <GenericListingCard
                                item={focusedItem}
                                category={focusedItemConfig}
                                upvotes={!!focusedItemConfig.upvotesEnabled}
                                count={focusedItem.upvotes ?? 0}
                                expanded
                                dense
                                hideBorder
                                highlightColor={focusedItemOption.color}
                                leadingIcon={
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onFocusListingChange?.(null)
                                    }}
                                    aria-label="Close"
                                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                                  >
                                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    </svg>
                                  </button>
                                }
                                onVote={() => {}}
                                onTagClick={() => {}}
                                onFilterOpen={() => {}}
                                onFilterBool={() => {}}
                                onFilterSelect={() => {}}
                                onEdit={() => onNavigate('patient', 'find', { findView: focusedItemOption.id, findItemId: focusedItem.id })}
                                onReport={() => onNavigate('patient', 'find', { findView: focusedItemOption.id, findItemId: focusedItem.id })}
                                onExpandedChange={(next) => { if (!next) onFocusListingChange?.(null) }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                )}
                {loading ? (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                    Loading map…
                  </div>
                ) : (
                  <ResourceMap
                    points={highlightedVisiblePoints}
                    userLocation={activeLocation}
                    onViewListing={onViewListing}
                    skipAutoFit={embedded}
                    fallbackCenter={embedded ? HOME_MAP_CENTER : undefined}
                    initialZoom={embedded ? 13 : undefined}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                    leftInsetPx={mapKeyLeftInsetPx}
                    onMarkerClick={(p) => {
                      // Always opens this facility's card in the map key's
                      // flyout too, not just the map's own info window —
                      // adding its category to the merged list first if it
                      // wasn't already selected (mirrors how a "jump to"
                      // search result opens a category it isn't already in
                      // — see jumpToMapCategory in Landing.tsx).
                      // `onFocusCategoryChange` TOGGLES, so only call it
                      // when the category isn't already selected, or a
                      // click on an already-selected category's pin would
                      // deselect it instead.
                      if (!p.filterId) return
                      if (!focusedCategoryIds?.has(p.filterId)) {
                        onFocusCategoryChange?.(p.filterId)
                        setCategoriesExplicitlyCleared(false)
                      }
                      onFocusListingChange?.(p.id)
                    }}
                    // Click-away to dismiss: tapping empty map space clears
                    // whatever listing is currently expanded beside it, on
                    // request — same idea as the map's own info window
                    // already closing on this same click.
                    onMapClick={() => onFocusListingChange?.(null)}
                    // Only a single tapped listing (`focusedPoint`) reframes
                    // the camera — filtering by category, however many
                    // categories or however it was triggered (a single
                    // checkbox, Select all, ...), no longer does at all, on
                    // request: the map stays at its default/current zoom
                    // instead of fitting/zooming out to frame every visible
                    // pin (which could be dragged way out by one outlier far
                    // from the default neighborhood view). Those pins still
                    // SHOW — `focusedCategoryPoints` still drives
                    // `visiblePoints` above, unaffected — the camera just
                    // never chases them.
                    focusPoints={focusedPoint ? [{ lat: focusedPoint.lat, lng: focusedPoint.lng }] : null}
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
    </div>
  )
}
