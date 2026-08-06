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
import { ExternalIcon, ToyIcon, BedIcon, StarOfDavid, ForkIcon, CartIcon, DropIcon } from '@/components/icons'
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
// the home page's category list) use the exact same colors. Reserved
// exclusively for hospitals/urgent care — not reused anywhere else on the
// map or site. See CATEGORY_COLORS' own doc comment for the pastel palette
// this belongs to.
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

// A cohesive pastel palette (was a 3-tier warm-neutral system where several
// categories shared one color) — every category now gets its own distinct
// hue, but all of them sit in the same soft, light range so the map reads as
// airy/calm rather than a mix of alarm-toned or dominant colors, on request.
// The request's own example hex values didn't actually hold to its own
// consistency rule though — checked their HSL and found saturation ranging
// S20%-S70%/lightness L66%-L75% across the set (the amber pin in particular,
// S70%, would visually dominate the S20% ones next to it) — so each hue below
// is normalized to a shared S42%/L80% instead of using those examples
// literally, satisfying the "no pin should visually dominate" requirement
// the brief itself asked to check for. Hue mapping: teal (synagogue),
// terracotta (hospitals, see HOSPITAL_COLOR above), amber (restaurant),
// olive-green (grocery), slate-blue (hotel), mauve (mikvah — this app has no
// "museums/cultural sites" category, mikvah fills that slot), tan (childcare
// — fills "family/kids resources"), sage (eruv — fills "parks/recreation";
// eruv has no pins of its own today, see ERUV_COLOR below, kept for parity).
// Every glyph drawn on top of these gets a darker version of the SAME hue,
// not black — see `darkenForGlyph` in ResourceMap.tsx, which derives that
// tint straight from each color below rather than a separate hardcoded dict,
// so the two can never drift out of sync.
// Keyed by category id for regular listing categories; kind:
// 'medical'/'zmanim'/'eruv'/'map' categories aren't uniquely identified
// by a fixed id the way listing categories are, so eruv is matched by
// kind instead below (hospitals use HOSPITAL_COLOR directly, not this
// dict — see allPoints below).
const CATEGORY_COLORS: Record<string, string> = {
  synagogue: '#B7E1DE', // pastel teal
  restaurant: '#E1D3B7', // pastel amber
  grocery: '#D2E1B7', // pastel olive-green
  // (Hospitals sit here in MAP_CATEGORY_ORDER, using HOSPITAL_COLOR itself — exclusive to this category.)
  hotel: '#B7D7E1', // pastel slate-blue
  mikvah: '#E1B7D0', // pastel mauve
  childcare: '#E1CBB7', // pastel tan
}
const ERUV_COLOR = '#BCE1B7' // pastel sage

// Exported so external UI (the home page's category list) computes the exact
// same color as the map's pins for a given category.
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
// plain letter ("H") and an emoji are handled identically. Mirrors
// CATEGORY_COLORS' structure exactly (hospitals/eruv pulled out of the dict
// for the same "not identified by a fixed listing-category id" reason).
const CATEGORY_GLYPHS: Record<string, string> = {
  synagogue: '✡', // Jewish star
  restaurant: '🍴', // fork
  grocery: '🛒', // shopping cart
  // (Hospitals use HOSPITAL_ICON 'H' directly, not this dict.)
  hotel: '🛏️', // bed
  mikvah: '💧', // drop of water
}
// Eruv never has pins of its own (see MAP_CATEGORY_ORDER above) — this is
// unused by any pin today, kept only for parity with ERUV_COLOR in case Eruv
// ever gains a pin presence, or another caller wants its fixed glyph.
const ERUV_GLYPH = '🧵' // a string/thread

// Every fixed category's pin now draws through a line-art icon (see
// LINE_ICON_PATHS in ResourceMap.tsx) instead of CATEGORY_GLYPHS' emoji —
// those crush to pure black/white at pin size, which can't produce the
// pastel palette's "darker version of the same hue" glyph tint. CATEGORY_GLYPHS
// itself stays populated as a fallback (see `allPoints` below) for any
// category outside this fixed set.
const LINE_ICON_BY_CATEGORY: Partial<Record<string, 'star' | 'fork' | 'cart' | 'drop' | 'toy' | 'bed'>> = {
  synagogue: 'star',
  restaurant: 'fork',
  grocery: 'cart',
  mikvah: 'drop',
  childcare: 'toy',
  hotel: 'bed',
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
  // The map key's own button row (see below) — tracked so its edge arrows
  // know which direction still has more to reveal, and so clicking one can
  // actually scroll the row instead of just decorating it.
  const keyRowRef = useRef<HTMLDivElement>(null)
  const [keyRowScroll, setKeyRowScroll] = useState({ atStart: true, atEnd: true })
  const updateKeyRowScroll = () => {
    const el = keyRowRef.current
    if (!el) return
    setKeyRowScroll({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 1,
    })
  }
  const scrollKeyRow = (dir: 1 | -1) => {
    keyRowRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  }

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

  // The map key's top row shows one category's own filter buttons in place
  // of the category list whenever exactly one category is selected — this
  // lets the user force it back to the category list (e.g. to pick a
  // second category) without deselecting the one they're filtering. Reset
  // whenever the selection itself changes, so a fresh click always lands on
  // that category's filters rather than staying stuck on the list — done
  // during render (React's "adjusting state on a prop change" pattern),
  // not an effect, since it needs to happen before this same render paints.
  const [forceCategoryList, setForceCategoryList] = useState(false)
  const [lastFocusedCategoryIds, setLastFocusedCategoryIds] = useState(focusedCategoryIds)
  if (focusedCategoryIds !== lastFocusedCategoryIds) {
    setLastFocusedCategoryIds(focusedCategoryIds)
    setForceCategoryList(false)
  }

  // When tracking starts, flip into follow mode and show the map.
  const handleStart = () => {
    setTab('map')
    start()
  }

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
    if ((categories ?? []).some((c) => c.kind === 'medical')) {
      for (const h of hospitals) {
        out.push({
          filterId: HOSPITALS_ID,
          id: `hospital:${h.id}`,
          lat: h.latitude,
          lng: h.longitude,
          name: h.name,
          color: HOSPITAL_COLOR,
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
        color: colorById.get(r.category) ?? '#D4CFC4',
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
      opts.push({ id: HOSPITALS_ID, label: 'Hospitals', icon: HOSPITAL_ICON, color: HOSPITAL_COLOR, count: counts.get(HOSPITALS_ID)! })
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
          <ToyIcon className="h-3.5 w-3.5" />
        ) : c.id === 'hotel' ? (
          <BedIcon className="h-3.5 w-3.5" />
        ) : (
          (CATEGORY_GLYPHS[c.id] ?? c.icon)
        )
      opts.push({ id: c.id, label: c.pluralLabel, icon, color: colorById.get(c.id) ?? '#D4CFC4', count })
    }
    return opts.sort((a, b) => rankMapId(a.id) - rankMapId(b.id))
  }, [allPoints, categories, colorById])

  // Re-check the map key's scroll-arrow visibility whenever the button set
  // itself changes — the row's scrollWidth can only be read after it
  // re-renders with the new buttons, not from the click/scroll handler alone.
  useEffect(() => {
    updateKeyRowScroll()
  }, [options])

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

  // Exactly one category selected — and not forced back to the category
  // list (see `forceCategoryList`) — swaps the top row over to THAT
  // category's own filter buttons (Open Now, boolean/select fields) instead
  // of the category list, so filtering it doesn't require digging into the
  // dropdown. Categories with nothing filterable (hospitals, Eruv) simply
  // have no chips, so this quietly falls back to the category list for them.
  const soleOption = openOptions.length === 1 ? openOptions[0] : undefined
  const soleConfig = soleOption ? categoryConfigById.get(soleOption.id) : undefined
  const soleItems = soleOption ? (listings ?? []).filter((item) => item.category === soleOption.id) : []
  const soleChips = soleConfig ? buildFilterChips(soleConfig, soleItems) : []
  const showFilterBar = !!soleOption && !!soleConfig && !forceCategoryList && soleChips.length > 0

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
                        cover browsing every listing. Scaled down to a
                        compact size (`text-[10px]`, tighter padding)
                        instead of its original full-size button. ───────── */}
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
                          className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                          style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                          </span>
                          Live — updating as you move
                        </span>
                        <button
                          onClick={stop}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:brightness-110 cursor-pointer"
                          style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                        >
                          Stop tracking
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleStart}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-md hover:brightness-110 cursor-pointer"
                        style={{ backgroundColor: FILTER_PILL_ACTIVE }}
                      >
                        <span aria-hidden="true">📍</span>
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
                        framing. Fixed `h-6` (rather than letting padding +
                        the input's line-height decide it) — matches the
                        Select all/category buttons' own height (see
                        below) — so the dropdown directly below always
                        starts at exactly `top-2 + h-6` = `top-8` — the
                        detail panel over on the right is pinned to that
                        same `top-8`, so the two dropdowns' own top edges
                        always land in the same place instead of drifting
                        apart by whatever the pill's content height
                        happened to be. ──────────────────────────────── */}
                {!loading && embedded && (
                  <div className="absolute left-2 top-2 z-20 flex w-64 flex-col">
                    {/* `h-6` (was `h-8`) — matches the Select all/Unselect
                        all/category buttons' own explicit `h-6` below, so
                        the two rows share one exact, deterministic height
                        instead of hoping their independently-computed
                        auto-heights happen to line up. Every dependent
                        offset below (`top-8` on the detail panel) is
                        `top-2 + h-6` = 8px + 24px = 32px, recomputed for
                        this new height. */}
                    <div className="flex h-6 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_6px_24px_rgb(0,0,0,0.12)]">
                      <svg className="h-3 w-3 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
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
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-900 placeholder:text-slate-500 focus:outline-none"
                      />
                      {/* Collapses the dropdown list below without touching
                          which categories are selected — a plain visual
                          toggle, independent of `focusedCategoryIds`. Only
                          shown when there's actually a list to collapse. */}
                      {openOptions.length > 0 && (
                        <button
                          onClick={() => setListCollapsed((v) => !v)}
                          aria-label={listCollapsed ? 'Show list' : 'Hide list'}
                          className="flex shrink-0 h-3.5 w-3.5 items-center justify-center text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          <svg
                            className={`h-2.5 w-2.5 transition-transform duration-200 ${listCollapsed ? '-rotate-90' : ''}`}
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
                          className={`mb-1 rounded-full border-2 px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
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
                              <li key={row.id}>
                                <button
                                  onClick={() => onFocusListingChange?.(isFocused ? null : row.id)}
                                  style={{ '--accent': row.categoryColor, ...(isFocused ? { color: 'var(--accent)' } : {}) } as React.CSSProperties}
                                  className={`group block w-full rounded px-1 py-1 text-left transition-colors cursor-pointer hover:text-[var(--accent)] ${
                                    isFocused ? 'bg-slate-100' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="block truncate text-[10px] font-medium">{row.name}</span>
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
                        {mergedEruvOption && (
                          <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
                            <button
                              onClick={() => onNavigate('patient', 'find', { findView: 'eruv' })}
                              style={{ color: mergedEruvOption.color }}
                              className="truncate text-[10px] font-semibold hover:underline cursor-pointer"
                            >
                              {mergedEruvOption.label}
                            </button>
                            <div className="space-y-2">
                              {eruvim.map((eruv) => (
                                <div key={eruv.id} className="border-2 border-slate-300 bg-white px-2.5 py-2">
                                  <p className="text-xs font-semibold text-slate-900">{eruv.name}</p>
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
                {/* ── Map key — a row of category buttons running along the
                        map's own top edge instead of down its left side, top
                        -aligned with the search bar right beside it (`top-2`
                        on both) rather than starting at the very left edge —
                        `left-72` leaves the search bar (`left-2 w-64`) its
                        own room instead of the button row running underneath
                        it. `right-12` reaches close to the map's own right
                        edge — live tracking lives down at the bottom-left
                        now, so there's nothing over there left to clear.
                        Horizontally scrollable
                        (`overflow-x-auto`) when they don't all fit, rather
                        than wrapping to a second row — stays one clean strip
                        regardless of category count. A chevron fades in on
                        whichever edge still has more buttons hidden off-
                        screen (`keyRowScroll`) instead of just truncating a
                        button mid-cutoff — clicking one scrolls the row
                        that direction (`scrollKeyRow`) rather than requiring
                        a drag/wheel gesture to discover it's scrollable at
                        all. Clicking a button TOGGLES that category into
                        `focusedCategoryIds` — the same set that isolates
                        pins on the map — so multiple buttons can be active
                        together, filtering the map to their union. Every
                        active category's items merge into ONE flat list
                        hanging off the search bar (see below), regardless
                        of how many categories are selected. Clicking a
                        listing inside it opens a detail panel flush beside
                        IT. Only shown when `embedded` (the home page) — the
                        standalone map screen keeps its own chip row above
                        instead. ─────────────────────────────────────────── */}
                {!loading && embedded && options.length > 0 && (
                    <>
                      {/* ── Select all / Unselect all — locked in place
                              OUTSIDE either mode below (filter chips or the
                              category list), so they stay visible and act on
                              every category at once regardless of whether a
                              single category's own filters are currently
                              showing here instead of the category buttons. */}
                      <div className="absolute left-72 right-12 top-2 z-20 flex items-center gap-1">
                        <button
                          onClick={selectAll}
                          disabled={options.every((o) => focusedCategoryIds?.has(o.id))}
                          className="inline-flex shrink-0 h-6 items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Select all
                        </button>
                        <button
                          onClick={unselectAll}
                          disabled={!focusedCategoryIds || focusedCategoryIds.size === 0}
                          className="inline-flex shrink-0 h-6 items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Unselect all
                        </button>
                      {showFilterBar && soleOption && soleConfig ? (
                        /* ── Filter-button bar — replaces the category list
                                while exactly one category is selected, so
                                clicking e.g. "Synagogues" repopulates this
                                same top strip with ITS filters (denomination,
                                Open Now, etc.) instead of leaving the
                                category buttons in place. Same position/
                                sizing as the category row it swaps with. ── */
                        <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          <button
                            onClick={() => setForceCategoryList(true)}
                            aria-label="Back to categories"
                            className="flex shrink-0 h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-md hover:text-slate-800 cursor-pointer"
                          >
                            ‹
                          </button>
                          {/* Was a plain `<span>` — not clickable, so once
                              this filter bar took over there was no way to
                              turn the sole category back off without first
                              tapping "‹" back to the full category list and
                              re-finding its button there. A `<button>` that
                              calls the exact same `selectTab` every other
                              category pill uses lets it double as its own
                              "unselect" control, same as clicking any
                              other active category chip does. */}
                          <button
                            onClick={() => selectTab(soleOption.id)}
                            aria-label={`Unselect ${soleOption.label}`}
                            style={{ backgroundColor: soleOption.color }}
                            className={`inline-flex shrink-0 h-6 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium shadow-md cursor-pointer ${
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
                                className={`inline-flex shrink-0 h-6 items-center justify-center whitespace-nowrap rounded-full border-2 px-2 text-[11px] font-medium shadow-sm transition-colors cursor-pointer ${
                                  active ? (needsDarkText(soleOption.color) ? 'text-black' : 'text-white') : 'bg-white hover:bg-slate-50'
                                }`}
                              >
                                {chip.label}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        /* ── Category buttons — individual pill buttons
                                (rounded, own shadow, gap between them), one
                                horizontal row that scrolls sideways instead of
                                wrapping. Flanked by chevron buttons (only
                                rendered on the edge(s) that still have more to
                                reveal) rather than just letting a button get
                                cut off mid-way with no hint there's more. ── */
                        <>
                          {!keyRowScroll.atStart && (
                            <button
                              onClick={() => scrollKeyRow(-1)}
                              aria-label="Scroll categories left"
                              className="flex shrink-0 h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-md hover:text-slate-800 cursor-pointer"
                            >
                              ‹
                            </button>
                          )}
                          <div
                            ref={keyRowRef}
                            onScroll={updateKeyRowScroll}
                            className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          >
                            {options.map((o) => {
                              const isOpen = focusedCategoryIds?.has(o.id) ?? false
                              return (
                                <button
                                  key={o.id}
                                  onClick={() => selectTab(o.id)}
                                  // Selected: filled solid with this category's
                                  // own pin color — like a mini pin — same as
                                  // before. Unselected: white instead, with a
                                  // colored border so the category is still
                                  // identifiable at a glance without every
                                  // button competing as a solid block of
                                  // color. The pastel palette (see
                                  // CATEGORY_COLORS) is pale across the
                                  // board now, not just mikvah —
                                  // `needsDarkText` decides per-category
                                  // whether filled text/icon needs to go
                                  // black instead of white, same check the
                                  // pin glyph itself makes. Unselected
                                  // text/icon color is
                                  // `readableTextOnWhite(o.color)` (see
                                  // Collapsible.tsx), not the raw pastel —
                                  // several of these colors are too pale to
                                  // read as plain text at full strength;
                                  // this darkens just enough to clear
                                  // contrast while the border stays the
                                  // category's true color.
                                  style={
                                    isOpen
                                      ? { backgroundColor: o.color, borderColor: o.color }
                                      : { borderColor: o.color, color: readableTextOnWhite(o.color) }
                                  }
                                  className={`inline-flex shrink-0 h-6 items-center justify-center gap-1 whitespace-nowrap rounded-full border-2 px-2 text-[11px] font-medium shadow-md transition-colors cursor-pointer ${
                                    isOpen
                                      ? `${needsDarkText(o.color) ? 'text-black' : 'text-white'} font-semibold ring-2 ring-white`
                                      : 'bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  {o.icon && (
                                    // Same flat monochrome-silhouette treatment
                                    // as the pin glyph itself (see
                                    // monoGlyphElement in ResourceMap.tsx) only
                                    // while selected/filled — crushes it to
                                    // whichever of black/white reads against
                                    // this category's own fill color (same
                                    // `needsDarkText` check as the pin).
                                    // Unselected, the icon keeps its own color
                                    // instead, since a white button has no
                                    // fill for a crushed icon to contrast with.
                                    <span
                                      aria-hidden="true"
                                      style={isOpen ? { filter: needsDarkText(o.color) ? 'brightness(0)' : 'brightness(0) invert(1)' } : undefined}
                                    >
                                      {o.icon}
                                    </span>
                                  )}
                                  {o.label}
                                </button>
                              )
                            })}
                          </div>
                          {!keyRowScroll.atEnd && (
                            <button
                              onClick={() => scrollKeyRow(1)}
                              aria-label="Scroll categories right"
                              className="flex shrink-0 h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-md hover:text-slate-800 cursor-pointer"
                            >
                              ›
                            </button>
                          )}
                        </>
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
                              read as one connected shape. `[&_*]:text-[10px]`
                              forces every text node inside the card down to
                              the dropdown's own small size — `dense` alone
                              (GenericListingCard's smallest built-in mode)
                              still isn't as small, and Tailwind's own
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
                              card shifting right underneath it too. */}
                      {onNavigate && focusedItemConfig && (
                        <div
                          className={`absolute left-[16.5rem] top-8 bottom-3 z-10 overflow-hidden rounded-2xl rounded-tl-none border border-l-0 border-slate-200 bg-[#fefefe] shadow-[0_6px_20px_rgb(0,0,0,0.06)] transition-[width] duration-300 ease-in-out ${
                            focusedItem ? 'w-64' : 'w-0 border-0'
                          }`}
                        >
                          <div className="h-full w-64 overflow-y-auto p-3 text-[10px] [&_*]:text-[10px]">
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
    </div>
  )
}
