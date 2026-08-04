'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ResourceMap, { type MapPoint } from './ResourceMap'
import CategoryFilter, { type FilterOption } from './CategoryFilter'
import CategoryPickerList from './CategoryPickerList'
import NearbyList from './NearbyList'
import MapPlaceDetail from './MapPlaceDetail'
import MobileNearbySheet, { type MobileNearbySheetHandle } from './MobileNearbySheet'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { DEFAULT_CATEGORY_ICON, resolveCapabilities, selectValues } from '@/lib/categories'
import { haversineMiles } from '@/lib/geo'
import { useHospitals } from '@/lib/useHospitals'
import { useIsMobile } from '@/lib/useIsMobile'
import type { LatLng } from '@/lib/googleMapsLinks'
import { listingSearchText } from '@/lib/searchListing'
import { hoursOpenNow } from '@/lib/hours'
import { ui } from '@/lib/uiConfig'
import { ChevronLeftIcon, ExpandIcon, CollapseIcon } from '@/components/icons'
import { getCategoryColor } from '@/lib/categoryColor'
import type { DirectoryResource, MapFilters } from '@/types'

const HOSPITALS_ID = '__hospitals__'
const HOSPITAL_COLOR = '#dc2626'
const HOSPITAL_ICON = '🏥'

// Typing one of these in the search box searches "open now" instead of
// matching literal text.
const OPEN_NOW_WORDS = new Set(['open', 'open now', 'opennow', 'open-now'])
const isOpenNowWord = (v: string) => OPEN_NOW_WORDS.has(v.trim().toLowerCase())

// Apostrophes shouldn't matter for matching at all — searching "trader joes"
// (no apostrophe, as most people type it) should still find "Trader Joe's",
// same as a mobile keyboard's smart-punctuation autocorrect turning a typed
// straight apostrophe into a curly one shouldn't break the match either.
// Stripping every apostrophe variant from both sides makes all of that a
// non-issue.
const stripApostrophes = (s: string) => s.replace(/['’‘ʼʻ]/g, '')

// The shape both selection surfaces (mobile's MobileNearbySheet, desktop's
// own sidebar detail panel) need for a "show this place" action — a subset
// of the richer point type this screen's own points carry (which also has
// searchText, used only for filtering).
type SelectablePoint = MapPoint & { filterId: string; raw?: DirectoryResource }

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
  /** The site-wide live GPS watch (see useLiveLocation), lifted to page.tsx so
   *  starting it here also updates `userLocation` everywhere else the same
   *  live coords are read (search sorting, directory distances) — not just
   *  this screen. Optional (defaults to an inert no-op) for callers that don't
   *  wire up real tracking, e.g. the admin category-preview map. */
  liveTracking?: {
    tracking: boolean
    error: string | null
    start: () => void
    stop: () => void
  }
}

const NOOP_LIVE_TRACKING = { tracking: false, error: null, start: () => {}, stop: () => {} }

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, initialSelectedCategories, initialFilters, onViewListing, liveTracking }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []
  const { tracking, error: geoError, start, stop } = liveTracking ?? NOOP_LIVE_TRACKING

  // `userLocation` (page.tsx's global coords) already updates continuously
  // once tracking is on — see useLiveLocation — so this screen just reads it
  // directly rather than keeping its own separate live position.
  const activeLocation: LatLng | null = userLocation ?? null

  // Mobile only — the quick chip row over the map shows a handful of
  // categories plus a trailing "More" chip; tapping it opens this full-screen
  // picker with every category, Google-Maps-style.
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  // Dismissible for the rest of this visit once tapped away — plain local
  // state (not persisted), so it resets on a real page reload but, since
  // ResourceMapView now stays mounted across tab switches (see page.tsx),
  // doesn't nag again just for leaving and returning to the Map tab.
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false)
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
  // Current px height of the mobile nearby sheet — reported up so ResourceMap
  // can center a newly-selected pin within the visible strip of map ABOVE the
  // sheet, instead of the whole box's center (which the sheet mostly covers).
  const [sheetHeightPx, setSheetHeightPx] = useState(0)
  // Tapping a marker on mobile should raise the bottom sheet's place detail
  // (Google-Maps-app-style) instead of opening the small info-window bubble
  // ResourceMap shows by default — desktop keeps that default.
  const isMobile = useIsMobile()
  // Measured px height of the floating search+filter-chips overlay (mobile
  // only) — it sits on top of the map, not the sheet, but blocks the same
  // amount of the map visually. ResourceMap needs this too so it centers a
  // selected pin in what's ACTUALLY visible: between the bottom of this
  // overlay and the top of the sheet, not from the literal top of the map box
  // (which is mostly hidden behind the search bar/category chips). A callback
  // ref (not a plain useRef) so the observer re-attaches whenever the overlay
  // div itself mounts/unmounts — it only exists once loading is done, tab is
  // 'map', and isMobile is known, and juggling all of those as effect deps
  // would be fragile.
  const [topOverlayEl, setTopOverlayEl] = useState<HTMLDivElement | null>(null)
  const [topOverlayHeight, setTopOverlayHeight] = useState(0)
  useEffect(() => {
    if (!topOverlayEl) return
    const ro = new ResizeObserver(([entry]) => setTopOverlayHeight(entry.contentRect.height))
    ro.observe(topOverlayEl)
    return () => ro.disconnect()
  }, [topOverlayEl])
  const nearbySheetRef = useRef<MobileNearbySheetHandle>(null)
  // The sheet's currently-selected place, reported up via onSelectionChange —
  // passed to ResourceMap as selectedId so it can highlight the matching
  // marker, making it clear which listing on the map the sheet is showing.
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(undefined)
  // Desktop's equivalent of MobileNearbySheet's own `selected` state — the
  // place currently shown in the sidebar's detail panel (MapPlaceDetail)
  // instead of its results list. Mobile keeps its own copy of this inside
  // MobileNearbySheet; desktop has no such child component (the sidebar is
  // built directly in this file) so it's tracked here instead.
  const [desktopSelected, setDesktopSelectedRaw] = useState<SelectablePoint | null>(null)
  // Also keeps selectedPointId (the marker-highlight id ResourceMap reads,
  // shared with mobile's own selection) in sync — set together, right where
  // the selection itself changes, rather than via a separate effect.
  const setDesktopSelected = (p: SelectablePoint | null) => {
    setDesktopSelectedRaw(p)
    setSelectedPointId(p?.id)
  }
  // Desktop-only — the map starts as a contained card (like an embedded
  // widget, not the whole page); this expands it to cover the viewport, and
  // collapses it back. Mobile is already effectively full-bleed within its
  // own tab, so it has no separate fullscreen toggle. Resets to false on
  // every mount rather than persisting, same as the rest of this screen's
  // local UI state.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    // Fullscreen is a fixed overlay covering the viewport — nothing behind
    // it should scroll while it's open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  // follow = map pans with every GPS tick. Turns off the moment the user
  // manually drags the map (see ResourceMap's dragstart listener), and only
  // resumes once they tap the re-center pill — matching Google Maps' own
  // blue-dot behavior instead of yanking the view back on every GPS tick.
  const [follow, setFollow] = useState(true)

  // When tracking starts, flip into follow mode.
  const handleStart = () => {
    setFollow(true)
    start()
  }

  // Selecting a place — from a marker tap, the sidebar's results list, or a
  // search suggestion — routes to whichever "show this place's details"
  // surface the current platform actually has: mobile's bottom sheet, or
  // desktop's sidebar detail panel.
  const selectPlace = (p: SelectablePoint) => {
    if (isMobile) nearbySheetRef.current?.selectPoint(p)
    else setDesktopSelected(p)
  }
  const deselectPlace = () => {
    if (isMobile) nearbySheetRef.current?.deselectPoint()
    else setDesktopSelected(null)
  }

  const colorById = useMemo(() => {
    const map = new Map<string, string>()
    ;(categories ?? []).forEach((c) => map.set(c.id, getCategoryColor(categories, c.id)))
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
    // Highest listing count first — the assumption being a category with more
    // listings is more likely to be the one a visitor's actually looking for.
    // Hospitals gets no special pinning here; it sorts in with everyone else.
    return opts.sort((a, b) => b.count - a.count)
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

  // A single active search query — like Google Maps, committing a new one
  // (including "open now", which is just this same slot's text, not a
  // separate chip) replaces whatever was there rather than stacking.
  // `committedQuery` only changes on Enter/suggestion-pick (not each
  // keystroke) — the map/list don't filter at all until you commit (see
  // activeTerms below); `input` (the box's live value) only drives the
  // autocomplete dropdown until then, and stays visible after a search,
  // same as the Google Maps app — it isn't cleared back to a blank box.
  const initialQueryText = initialQuery ?? (initialFilters?.openNow ? 'open now' : '')
  const [input, setInput] = useState(initialQueryText)
  const [committedQuery, setCommittedQuery] = useState(initialQueryText)

  const commitQuery = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    setCommittedQuery(v)
  }
  const clearQuery = () => {
    setInput('')
    setCommittedQuery('')
  }
  // Whether the committed query is asking for "open now" rather than a
  // literal text match — applied as its own predicate in visiblePoints below.
  const openNowActive = isOpenNowWord(committedQuery)

  // ── Search autocomplete — Google-Maps-style dropdown of matching places
  // while typing, independent of the live text-filter above (which narrows
  // the map/list) and of category toggles (a name match should surface even
  // if that category's chip happens to be off). Shared logic; mobile and
  // desktop each mount their own actual <input> (see the render below). ────
  const [searchFocused, setSearchFocused] = useState(false)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)
  const searchSuggestions = useMemo(() => {
    const q = stripApostrophes(input.trim().toLowerCase())
    if (q.length < 2 || isOpenNowWord(q)) return []
    const starts: typeof allPoints = []
    const contains: typeof allPoints = []
    for (const p of allPoints) {
      const name = stripApostrophes(p.name.toLowerCase())
      if (name.startsWith(q)) starts.push(p)
      else if (name.includes(q)) contains.push(p)
    }
    // Within each match-quality bucket, closest first when we have a location;
    // otherwise most-upvoted first, so ties don't fall back to storage order.
    const rank = (p: (typeof allPoints)[number]) =>
      activeLocation ? haversineMiles(activeLocation, { lat: p.lat, lng: p.lng }) : -(p.raw?.upvotes ?? 0)
    const byRank = (a: (typeof allPoints)[number], b: (typeof allPoints)[number]) => rank(a) - rank(b)
    return [...starts.sort(byRank), ...contains.sort(byRank)].slice(0, 6)
  }, [allPoints, input, activeLocation])

  // Picking a suggestion jumps straight to that place — map pin + sheet detail
  // — instead of just adding it as a narrowing text filter. Setting
  // committedQuery to the place's own name (below) still broadens the
  // committed search to every place that name matches (e.g. every "GIANT"
  // location) — necessary so the map/list have a sensible fallback if the
  // visitor backs out of this one place — which would otherwise re-trigger
  // the commit effect further down and immediately clear this exact
  // selection again (multiple matches → that effect shows the LIST, not one
  // card). suppressNextCommitEffectRef tells that effect to skip its one
  // upcoming run so the specific place picked here actually sticks.
  const suppressNextCommitEffectRef = useRef(false)
  const selectSuggestion = (p: (typeof allPoints)[number]) => {
    suppressNextCommitEffectRef.current = true
    setInput(p.name)
    setCommittedQuery(p.name)
    setSearchFocused(false)
    mobileSearchInputRef.current?.blur()
    desktopSearchInputRef.current?.blur()
    selectPlace(p)
  }

  // Submitting the search (the mobile keyboard's "Search" action key, via the
  // wrapping <form> below, not a keydown check — the one reliable way to
  // catch that key across mobile browsers) does everything the Google Maps
  // app does: picks the place directly if it's the one unambiguous match,
  // otherwise commits the query so the sheet shows the result list, dismisses
  // the dropdown, and closes the keyboard.
  const submitSearch = () => {
    if (searchSuggestions.length === 1) selectSuggestion(searchSuggestions[0])
    else commitQuery(input)
    setSearchFocused(false)
    mobileSearchInputRef.current?.blur()
    desktopSearchInputRef.current?.blur()
  }

  // Clearing the search (the × button) resets the sheet/sidebar back to its
  // normal browsing state — same as Google Maps: the selected place/result
  // list disappears and the sheet collapses — and does NOT refocus the
  // input, so the keyboard stays down until the visitor deliberately taps
  // the search box again.
  const clearSearch = () => {
    clearQuery()
    setSearchFocused(false)
    mobileSearchInputRef.current?.blur()
    desktopSearchInputRef.current?.blur()
    if (isMobile) nearbySheetRef.current?.collapse()
    else setDesktopSelected(null)
  }

  // The committed query filters as one phrase (not per-word AND terms) —
  // except "open now", which is its own predicate (openNowActive above), not
  // a literal text match. Derived from committedQuery, not the live `input`,
  // so nothing actually filters until you commit — see point 3 in the commit
  // this replaces: typing alone no longer narrows the map/list.
  const activeTerms = useMemo(() => {
    const q = stripApostrophes(committedQuery.trim().toLowerCase())
    return q && !isOpenNowWord(q) ? [q] : []
  }, [committedQuery])

  // ── Field filters (kosher / type / … carried from the directory) ─────────
  // Held as a serializable spec (also what's persisted to history). "Open
  // now" isn't here — it's just the committed query text (see openNowActive
  // above), so it behaves exactly like any other search instead of stacking
  // as a separate persistent chip. Predicates below are derived once
  // categories load.
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

  // A field's display label. Searches every category (not just the one the
  // visitor arrived from) since a filter can now also be turned on directly
  // from the map's own category picker, for any category shown there.
  const labelForField = (key: string): string => {
    for (const cat of categories ?? []) {
      const f = cat.detailFields.find((x) => x.key === key)
      if (f) return f.filterLabel ?? f.label
    }
    return key
  }

  // Whether `key` is actually one of `categoryId`'s own declared fields —
  // distinguishes "this listing's category doesn't have this field at all"
  // (a Synagogue has no `isKosher` — always let it pass, see below) from
  // "this listing's category HAS this field, but this particular listing
  // just never had it set" (a Mikvah with no `keilim` key at all, because
  // it was never explicitly toggled — that means no, not "doesn't apply").
  // Only the first case gets the lenient pass; a field a listing's own
  // category declares is checked strictly, undefined included.
  function categoryHasField(categoryId: string, key: string): boolean {
    return (categories ?? []).some((c) => c.id === categoryId && c.detailFields.some((f) => f.key === key))
  }

  // Active field-level filters (bool/select), each an AND predicate — but
  // only for listings whose own category actually has the field; a listing
  // from an unrelated category always passes (so "Kosher" ignores shuls,
  // etc. — see categoryHasField above). Shown on-screen not as their own
  // removable chips but folded into the owning category's own chip (see
  // optionsWithFilters) — this array is now purely the filtering logic, no
  // display data.
  const filterChips = useMemo(() => {
    const chips: { id: string; test: (r: DirectoryResource) => boolean }[] = []
    for (const field of boolFields) {
      chips.push({
        id: `b:${field}`,
        test: (r) => !categoryHasField(r.category, field) || r[field] === true,
      })
    }
    for (const [field, values] of Object.entries(selectFilters)) {
      if (!values.length) continue
      chips.push({
        id: `s:${field}`,
        // A multiSelect field stores an array (e.g. foodType: ["Restaurant",
        // "Catering"]), not a plain string — selectValues() normalizes both
        // shapes, so a listing tagged with several values still matches on
        // any one of them instead of only an exact single-value match.
        test: (r) => {
          if (!categoryHasField(r.category, field)) return true
          return selectValues(r[field]).some((v) => values.includes(v))
        },
      })
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boolFields, selectFilters, categories, initialCategory])

  // `options`, with each category's own active bool/select filters (if any)
  // folded in as a display suffix — e.g. Mikvah's chip reads "Mikvah 3 ·
  // Keilim" instead of the count alone, so an active filter shows up right on
  // the chip it belongs to rather than as a separate row of removable pills
  // underneath (which read as a disconnected, generically-colored "extra
  // thing" rather than part of the category it was actually scoped to). The
  // count itself also switches from the category's raw total to however many
  // of its points actually pass that filter — reusing filterChips' own tests
  // (each already a no-op for a category that doesn't own the field) rather
  // than re-deriving the same logic a second way.
  const optionsWithFilters = useMemo(() => {
    return options.map((o) => {
      const parts: string[] = []
      for (const key of boolFields) {
        if (categoryHasField(o.id, key)) parts.push(labelForField(key))
      }
      for (const [key, values] of Object.entries(selectFilters)) {
        if (values.length && categoryHasField(o.id, key)) parts.push(values.join('/'))
      }
      if (parts.length === 0) return o
      const count = allPoints.filter(
        (p) => p.filterId === o.id && (!p.raw || filterChips.every((c) => c.test(p.raw as DirectoryResource))),
      ).length
      return { ...o, count, filterSuffix: parts.join(', ') }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, boolFields, selectFilters, categories, allPoints, filterChips])

  // Keep the current history entry in sync with the committed query/filters/
  // selection, so returning via browser Back restores what was actually on
  // screen — not just the snapshot from when the map was first opened (or
  // last touched a chip). Persists committedQuery, not the live `input`, so
  // this doesn't fire on every keystroke.
  useEffect(() => {
    const current = window.history.state as { mode?: string } | null
    if (current?.mode !== 'map') return
    const anyFilter = openNowActive || boolFields.length > 0 || Object.keys(selectFilters).length > 0
    history.replaceState(
      {
        ...current,
        mapQuery: committedQuery || undefined,
        mapSelected: selected ? Array.from(selected) : undefined,
        mapFilters: anyFilter
          ? {
              openNow: openNowActive || undefined,
              bool: boolFields.length ? boolFields : undefined,
              select: Object.keys(selectFilters).length ? selectFilters : undefined,
            }
          : undefined,
      },
      '',
    )
  }, [committedQuery, selected, openNowActive, boolFields, selectFilters])

  const visiblePoints = useMemo(() => {
    return allPoints
      .filter((p) => effectiveSelected.has(p.filterId))
      .filter((p) => activeTerms.every((t) => stripApostrophes(p.searchText).includes(t)))
      .filter((p) => !p.raw || filterChips.every((c) => c.test(p.raw as DirectoryResource)))
      .filter((p) => {
        if (!openNowActive || !p.raw) return true
        const keys = hoursKeysByCat.get(p.raw.category)
        return !keys?.length || keys.some((k) => hoursOpenNow(p.raw![k]) === true)
      })
  }, [allPoints, effectiveSelected, activeTerms, filterChips, openNowActive, hoursKeysByCat])

  // Whether a search/filter is meaningfully "active" — used to (a) gate the
  // sheet-raise/auto-select effect below to commit points instead of every
  // keystroke, and (b) tell ResourceMap it should refit the viewport to the
  // results even when a user location is set (which normally takes priority
  // over reframing — see ResourceMap's marker-sync effect).
  const searchActive = !!committedQuery || filterChips.length > 0

  // Committing a search query or filter chip (not each keystroke —
  // committedQuery/filterChips only change at commit points, unlike
  // activeTerms/visiblePoints which also track the live-typed text) surfaces
  // the result the way Google Maps does: exactly one match opens straight to
  // its card; more than one shows the list (raising the sheet on mobile,
  // dropping any previously-selected place on desktop so the sidebar's list
  // is what's visible).
  useEffect(() => {
    if (suppressNextCommitEffectRef.current) {
      suppressNextCommitEffectRef.current = false
      return
    }
    if (!searchActive) return
    if (isMobile) {
      if (visiblePoints.length === 1) nearbySheetRef.current?.selectPoint(visiblePoints[0])
      else if (visiblePoints.length > 1) nearbySheetRef.current?.raise()
    } else {
      // Reacting to a commit (query/filter), not a render value — there's no
      // single non-effect call site for this, since commits land via several
      // different handlers (submitSearch, toggleBoolField, toggleSelectValue, ...).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDesktopSelected(visiblePoints.length === 1 ? visiblePoints[0] : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedQuery, filterChips])

  // Clears any active bool/select filter belonging to one of `ids` — an
  // explicit reset (Hide all, or narrowing down via "Show all" → one chip),
  // not something that happens just from toggling a category off: a filter
  // stays put across an off/on cycle so it's there again when the category
  // comes back, and the only way to actually clear it is to unset it directly
  // (the picker's per-field controls, or the chip's own inline editor).
  function clearFiltersForCategories(ids: Iterable<string>) {
    const idSet = new Set(ids)
    if (idSet.size === 0) return
    const keys = new Set<string>()
    for (const cat of categories ?? []) {
      if (!idSet.has(cat.id)) continue
      for (const f of cat.detailFields) {
        if (f.filterable && (f.type === 'boolean' || f.type === 'select')) keys.add(f.key)
      }
    }
    if (keys.size === 0) return
    setBoolFields((prev) => prev.filter((k) => !keys.has(k)))
    setSelectFilters((prev) => {
      const next = { ...prev }
      for (const k of keys) delete next[k]
      return next
    })
  }

  const toggle = (id: string) => {
    // Starting from "everything shown", a tap on a single chip should narrow
    // straight down to just that category — same as Google Maps' filter
    // chips — rather than requiring "Hide all" first and then re-enabling
    // the one category you actually wanted. Once you've narrowed down,
    // further taps add/remove from that subset as before. Any category's
    // stored filters ride along either way (see clearFiltersForCategories).
    if (effectiveSelected.size === options.length) {
      setSelected(new Set([id]))
      return
    }
    const next = new Set(effectiveSelected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelected(next)
  }
  const showAll = () => setSelected(new Set(options.map((o) => o.id)))
  const hideAll = () => {
    setSelected(new Set())
    clearFiltersForCategories(effectiveSelected)
  }

  // A plain, unconditional on/off toggle — unlike `toggle` above, this never
  // "narrows to just this one" when everything's currently shown. That smart
  // behavior makes sense for the compact chip row (each chip reads as its own
  // tap target, not literally a checkbox), but a real <input type="checkbox">
  // in the picker needs to mean exactly what it shows: checked ⇄ unchecked,
  // full stop — nothing else is defensible for an actual checkbox control.
  const toggleCategoryCheckbox = (id: string) => {
    const next = new Set(effectiveSelected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelected(next)
  }

  // Adds `id` to the current selection without touching anything else —
  // including the `null` "everything shown" state, which stays `null` (not
  // materialized into an explicit full Set) when `id` is already included,
  // so this never turns an implicit "all" into a Set that then excludes a
  // category added to the config later.
  function ensureSelected(id: string) {
    setSelected((prev) => {
      const cur = prev ?? new Set(options.map((o) => o.id))
      if (cur.has(id)) return prev
      return new Set(cur).add(id)
    })
  }

  // Turning a category's OWN filter on implies wanting to see that category —
  // same logic in both: pick a Kosher Cert for Food Establishments and it
  // switches on even if you hadn't checked it yet, instead of silently doing
  // nothing until you separately remember to also check the box.
  function toggleBoolField(categoryId: string, key: string) {
    const adding = !boolFields.includes(key)
    setBoolFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]))
    if (adding) ensureSelected(categoryId)
  }
  function toggleSelectValue(categoryId: string, key: string, value: string) {
    const adding = !(selectFilters[key] ?? []).includes(value)
    setSelectFilters((prev) => {
      const cur = prev[key] ?? []
      return { ...prev, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] }
    })
    if (adding) ensureSelected(categoryId)
  }

  const loading = listings === null || categories === null

  // The place currently shown in the desktop sidebar's detail panel, if
  // any — mirrors MobileNearbySheet's own `selected` lookup pattern.
  const desktopSelectedCategory = desktopSelected
    ? (categories ?? []).find((c) => c.id === desktopSelected.filterId)
    : undefined

  // Whether the visitor has actually asked for something (a search, a
  // narrowed category selection, or a field filter) — Google Maps' own
  // sidebar starts bare (just the search box + quick chips), not with every
  // place already listed; the results list only appears once there's a
  // reason to show one.
  const desktopNarrowed = selected !== null || committedQuery.length > 0 || filterChips.length > 0

  // ── Desktop search box + its autocomplete dropdown — shared between the
  // two places it can render: floating directly on the map (the default
  // browsing state, Google-Maps-style) or embedded at the top of the
  // sidebar (once something's actually been searched/picked). Only one of
  // these ever actually mounts at a time (the two call sites are mutually
  // exclusive on desktopNarrowed/desktopSelected), so this still respects
  // "only one desktop <input> in the DOM at once" — see the mobile input's
  // own comment about why that matters. ─────────────────────────────────
  const desktopSearchForm = ui.search.map && !isMobile && (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitSearch()
        }}
        className="flex items-center rounded-full border border-slate-300 bg-white px-3.5 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary"
      >
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          ref={desktopSearchInputRef}
          type="text"
          autoComplete="off"
          placeholder="Search name, address, or 'open now'…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchFocused(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {input && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {/* ── Autocomplete dropdown — same Google-Maps-style behavior as
              mobile's: matching places while typing, click one to jump
              straight to its card. ─────────────────────────────────────── */}
      {searchFocused && searchSuggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg">
          {searchSuggestions.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(p)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                style={{ backgroundColor: p.color + '22' }}
                aria-hidden="true"
              >
                {p.glyph ?? '📍'}
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {p.categoryLabel}
                  {p.address ? ` · ${p.address}` : ''}
                </p>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // The category chips — also shared between the floating and embedded
  // placements. Ducks out of the way while the dropdown above is open, same
  // as mobile's own floating chip row.
  const desktopCategoryChips = options.length > 0 && !(searchFocused && searchSuggestions.length > 0) && (
    <CategoryFilter
      options={optionsWithFilters}
      selected={effectiveSelected}
      onToggle={toggle}
      onAll={showAll}
      onNone={hideAll}
      categories={categories ?? []}
      boolFields={boolFields}
      onToggleBool={toggleBoolField}
      selectFilters={selectFilters}
      onToggleSelectValue={toggleSelectValue}
    />
  )

  return (
    // Mobile: a flex column that grows to fill <main> (itself a flex column —
    // see page.tsx) via flex-1/min-h-0, so the map below can flex-1 to fill
    // everything between the site header and the tab bar with no guessed
    // pixel height. Desktop: a flex ROW filling <main> the same way — a
    // sidebar (search/filters/results, Google-Maps-desktop-style) plus the
    // map filling the rest, both full height, instead of the old stacked/
    // boxed layout. ──────────────────────────────────────────────────────
    <div
      className={`flex flex-1 min-h-0 flex-col sm:flex-row sm:overflow-hidden ${
        fullscreen
          ? 'sm:fixed sm:inset-0 sm:z-50 sm:rounded-none sm:ring-0'
          : 'sm:relative sm:h-[70vh] sm:min-h-[420px] sm:flex-none sm:rounded-2xl sm:ring-1 sm:ring-slate-900/5'
      }`}
    >
      {loading ? (
        <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-slate-100 text-sm text-slate-500">
          Loading map…
        </div>
      ) : (
        <>
          {/* ── Desktop sidebar — only once the visitor has actually asked
                  for something (a search, a narrowed category, or a
                  selected place). Google Maps' own panel doesn't exist
                  until then either; before that, search + chips just float
                  on the map (see below) and the map stays full width. ──── */}
          {!isMobile && (desktopNarrowed || !!desktopSelected) && (
            <aside className="hidden shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white sm:flex sm:w-[380px] sm:min-h-0">
              {/* ── Search + category chips — one visual block, chips sitting
                      right under the search box with no divider between them. ── */}
              <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                {desktopSearchForm}
                {desktopCategoryChips && <div className="mt-2.5">{desktopCategoryChips}</div>}
              </div>

              {ui.map.nearbyList && (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {desktopSelected && desktopSelected.raw && desktopSelectedCategory ? (
                    <MapPlaceDetail
                      item={desktopSelected.raw}
                      category={desktopSelectedCategory}
                      glyph={desktopSelected.glyph}
                      color={desktopSelected.color}
                      onBack={() => setDesktopSelected(null)}
                    />
                  ) : (
                    <>
                      {activeLocation && (
                        <p className="mb-2 px-1 text-xs text-slate-400">
                          Sorted by distance from your location{tracking ? ', updating live as you move.' : '.'}
                        </p>
                      )}
                      <NearbyList
                        points={visiblePoints}
                        userLocation={activeLocation}
                        onViewListing={onViewListing}
                        onSelectPlace={selectPlace}
                      />
                    </>
                  )}
                </div>
              )}
            </aside>
          )}

          {/* ── Map. Mobile: full-bleed (breaks out of the page's max-width/
                  padding) and fills the rest of the flex column (flex-1) —
                  genuinely edge to edge, right up to the header, since
                  search/filters float ON the map itself instead of pushing it
                  down. Desktop: fills everything to the right of the sidebar,
                  same edge-to-edge treatment, no boxed card — same as Google
                  Maps. ────────────────────────────────────────────────────── */}
          <div
            ref={mapBoxRef}
            className="relative left-1/2 flex min-h-[320px] w-screen flex-1 -translate-x-1/2 flex-col overflow-hidden sm:left-0 sm:min-h-0 sm:w-auto sm:translate-x-0"
          >
              <ResourceMap
                points={visiblePoints}
                userLocation={activeLocation}
                follow={follow}
                onResumeFollow={() => setFollow(true)}
                onManualDrag={() => setFollow(false)}
                onViewListing={onViewListing}
                onSelectPoint={(p) => selectPlace(p as SelectablePoint)}
                onDeselectPoint={deselectPlace}
                onBackgroundClick={() => (isMobile ? nearbySheetRef.current?.lower() : setDesktopSelected(null))}
                searchActive={searchActive}
                selectedId={selectedPointId}
                obscuredBottomPx={isMobile ? sheetHeightPx : 0}
                obscuredTopPx={isMobile ? topOverlayHeight : 0}
              />

              {/* ── Fullscreen toggle (desktop only) — the map starts as a
                      contained card; this expands it to cover the viewport
                      (Escape, or tapping it again, collapses it back). ──── */}
              <button
                onClick={() => setFullscreen((f) => !f)}
                aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                aria-pressed={fullscreen}
                className="absolute right-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-md ring-1 ring-slate-900/10 hover:bg-slate-50 cursor-pointer sm:flex"
              >
                {fullscreen ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
              </button>

              {/* ── Live-tracking toggle (desktop only) — a map control, not a
                      sidebar row, same as Google Maps' own "my location" button.
                      Bottom-left so it never collides with the re-center pill
                      ResourceMap draws bottom-right once a location is set. ── */}
              {ui.map.liveTracking && (
                <button
                  onClick={() => (tracking ? stop() : handleStart())}
                  aria-label={tracking ? 'Stop tracking my location' : 'Track my location'}
                  aria-pressed={tracking}
                  className={`absolute bottom-3 left-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full shadow-md ring-1 cursor-pointer sm:flex ${
                    tracking
                      ? 'bg-blue-600 text-white ring-blue-600 hover:bg-blue-700'
                      : 'bg-white text-slate-600 ring-slate-900/10 hover:bg-slate-50'
                  }`}
                >
                  <span aria-hidden="true">📍</span>
                </button>
              )}
              {ui.map.liveTracking && geoError && (
                <p className="absolute bottom-14 left-3 z-10 hidden max-w-[220px] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow-md sm:block">
                  {geoError}
                </p>
              )}

              {/* ── Floating search + chips (desktop, default browsing state)
                      — laid directly on the map, chips right next to the search
                      box in the same row, exactly like Google Maps' own explore
                      controls. Replaced by the sidebar (above) the moment
                      there's an actual search/selection to show. ───────────── */}
              {!isMobile && !desktopNarrowed && !desktopSelected && (
                // right-16 (not right-3): leaves clearance so the chip row's
                // scroll area doesn't run under the fullscreen button, which
                // shares this same top-right corner.
                <div className="absolute left-3 right-16 top-3 z-10 hidden items-start gap-2 sm:flex">
                  <div className="w-72 shrink-0">{desktopSearchForm}</div>
                  {desktopCategoryChips && <div className="min-w-0 flex-1 pt-0.5">{desktopCategoryChips}</div>}
                </div>
              )}

              {/* ── Floating search + filters (mobile) — laid directly over the
                      map, Google-Maps-style, instead of pushing it down. Category
                      chips sit right under the search bar as their own
                      always-visible scroll row, same as Google Maps — no
                      separate "Filters" button/sheet. ───────────────────────── */}
              {ui.search.map && isMobile && (
                <div
                  ref={setTopOverlayEl}
                  className="absolute inset-x-0 top-0 z-10 px-3 pb-2 sm:hidden"
                  style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
                >
                  <div className="flex items-center gap-2">
                    {/* A real <form> is the one reliable way to catch a mobile
                        keyboard's "Search" action key across browsers — it
                        guarantees submission the same way pressing Enter on a
                        desktop keyboard does, rather than depending on that
                        key reliably dispatching a keydown 'Enter'. */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitSearch() }}
                      className="flex flex-1 items-center rounded-full bg-white px-3.5 py-2.5 shadow-lg"
                    >
                      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                      </svg>
                      <input
                        ref={mobileSearchInputRef}
                        type="text"
                        enterKeyHint="search"
                        autoComplete="off"
                        placeholder="Search name, address, 'open now'…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={() => {
                          setSearchFocused(true)
                          // Drop the sheet out of the way while actively
                          // searching — at half or full it sits over the
                          // search box/dropdown. Keeps any selected place
                          // (lower, not collapse), so dismissing the keyboard
                          // brings it right back to where it was.
                          nearbySheetRef.current?.lower()
                        }}
                        onBlur={() => setSearchFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setSearchFocused(false)
                            ;(e.target as HTMLInputElement).blur()
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                      {input && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          aria-label="Clear search"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </form>
                  </div>

                  {/* ── Category filter chips — Google-Maps-style: a always-
                          visible horizontal-scroll row of pill toggles right
                          under the search bar, floating directly on the map
                          (no separate "Filters" button/sheet). Ducks out of the
                          way while the autocomplete dropdown below is showing,
                          same as Google Maps swapping chips for suggestions. ── */}
                  {options.length > 0 && !(searchFocused && searchSuggestions.length > 0) && (
                    <div className="mt-2">
                      <CategoryFilter
                        options={optionsWithFilters}
                        selected={effectiveSelected}
                        onToggle={toggle}
                        onAll={showAll}
                        onNone={hideAll}
                        maxVisible={4}
                        onMore={() => setCategoriesOpen(true)}
                                    categories={categories ?? []}
                        boolFields={boolFields}
                        onToggleBool={toggleBoolField}
                        selectFilters={selectFilters}
                        onToggleSelectValue={toggleSelectValue}
                      />
                    </div>
                  )}

                  {/* ── Autocomplete dropdown — Google-Maps-style: matching
                          places while typing, tap one to jump straight to its
                          card instead of just narrowing the list. ─────────── */}
                  {searchFocused && searchSuggestions.length > 0 && (
                    <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">
                      {searchSuggestions.map((p) => (
                        <button
                          key={p.id}
                          // Prevents the input's blur (which would close this
                          // dropdown before the click lands) from firing at all.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(p)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                            style={{ backgroundColor: p.color + '22' }}
                            aria-hidden="true"
                          >
                            {p.glyph ?? '📍'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                            <p className="truncate text-xs text-slate-400">
                              {p.categoryLabel}
                              {p.address ? ` · ${p.address}` : ''}
                            </p>
                          </span>
                        </button>
                      ))}
                    </div>
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

              {/* ── No-location prompt (mobile) — without an anchor, distances/
                      sorting and the re-center dot have nothing to work from, and
                      it's easy to land here from the Categories tab without ever
                      noticing the "Set location" pill up in the header. Sits above
                      the tracking FAB (bottom-[8.25rem] clears its 4.75rem offset
                      + 3rem height + a small gap) so the two never collide. Opens
                      the same header popover as AddressPrompt, via the same
                      'jpc:open-location' event, rather than duplicating an address
                      input here. */}
              {!activeLocation && !locationPromptDismissed && (
                <div className="absolute bottom-[8.25rem] inset-x-3 z-10 flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-lg ring-1 ring-slate-900/5 sm:hidden">
                  <span className="text-xl shrink-0" aria-hidden="true">📍</span>
                  <p className="min-w-0 flex-1 text-xs text-slate-600">
                    Set your location to see how far places are.
                  </p>
                  <button
                    onClick={() => document.dispatchEvent(new CustomEvent('jpc:open-location'))}
                    className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    Set location
                  </button>
                  <button
                    onClick={() => setLocationPromptDismissed(true)}
                    aria-label="Dismiss"
                    className="shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
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
                  onSelectionChange={(point) => setSelectedPointId(point?.id)}
                  onHeightChange={setSheetHeightPx}
                />
              )}
          </div>
        </>
      )}

      {/* ── "No results" fallback — only needed when the results list itself
              is turned off (ui.map.nearbyList), since NearbyList otherwise
              already shows this same message inline (mobile sheet / desktop
              sidebar). ───────────────────────────────────────────────────── */}
      {!loading && !ui.map.nearbyList && visiblePoints.length === 0 && (
        <p className="mt-3 text-center text-sm text-slate-500">
          {activeTerms.length > 0 || filterChips.length > 0
            ? 'No places match every filter. Try removing one.'
            : 'No places shown. Turn on a category above to see locations.'}
        </p>
      )}

      {/* ── Full-screen category picker (mobile) — the quick chip row's
              trailing "More" chip opens this, same as Google Maps expanding
              its own filter row into a dedicated screen. A checkbox per
              category builds a multi-category browse (top-down full-width
              rows — easier one-handed reach than the chip row's pill
              cluster), and each category with its own filterable fields gets
              a chevron that expands the row in place to reveal them (see
              CategoryPickerList). ────────────────────────────────────────── */}
      {categoriesOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:hidden">
          <div
            className="flex shrink-0 items-center gap-3 px-4 pb-3"
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
          >
            <button
              onClick={() => setCategoriesOpen(false)}
              aria-label="Back to map"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-base font-semibold text-slate-900">Categories</h2>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-3">
            <button
              onClick={effectiveSelected.size === options.length ? hideAll : showAll}
              className="text-sm font-medium text-primary cursor-pointer"
            >
              {effectiveSelected.size === options.length ? 'Hide all' : 'Show all'}
            </button>
            <button
              onClick={() => setCategoriesOpen(false)}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white cursor-pointer"
            >
              Apply
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <CategoryPickerList
              options={options}
              categories={categories ?? []}
              points={allPoints}
              selected={effectiveSelected}
              onToggle={toggleCategoryCheckbox}
              boolFields={boolFields}
              onToggleBool={toggleBoolField}
              selectFilters={selectFilters}
              onToggleSelectValue={toggleSelectValue}
            />
          </div>
        </div>
      )}
    </div>
  )
}
