'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import LocationControl, { type LocationControls } from '@/components/home/LocationControl'
import { usePinned } from '@/lib/pinnedContext'
import { useDroppedPins } from '@/lib/droppedPinsContext'
import DroppedPinEditor from './DroppedPinEditor'
import type { DirectoryResource, MapFilters } from '@/types'

const HOSPITALS_ID = '__hospitals__'
const HOSPITAL_COLOR = '#dc2626'
const HOSPITAL_ICON = '🏥'
// A dropped pin's marker id is prefixed with this so a click handler can
// tell it apart from a real listing/hospital point without a separate prop
// threaded through every consumer — see droppedMapPoints below.
const DROPPED_PREFIX = 'dropped:'
const DROPPED_FILTER_ID = '__dropped__'
const DROPPED_PIN_COLOR = '#D85A30'

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
  /** The pin id to open the detail panel/sheet for on arrival — the `place`
   *  query param (see mapQueryString/parseMapQuery), read once on mount.
   *  Standalone only: this is what makes a map link shareable down to the
   *  specific pin someone had open, not just the pins and filters. */
  initialPlaceId?: string
  /** Open a specific listing's detail card in its category directory. */
  onViewListing?: (categoryId: string, listingId: string) => void
  /** True for the one page-level map screen (mode 'map' in page.tsx) — as
   *  opposed to the small contained map embedded directly on the home screen
   *  (see HomeMap), which is a separate mounted instance of this same
   *  component and never sets this. Desktop only in effect: a standalone map
   *  always opens (and stays) fullscreen — there's no boxed state for it —
   *  and its exit control always navigates away via onExitFullscreenToListing
   *  rather than collapsing in place, however the visitor got here (a
   *  listing's own "Map" button, the mobile tab bar, browser back/forward).
   *  The embedded home-screen map keeps its own boxed-by-default, expand-in-
   *  place behavior untouched. */
  standalone?: boolean
  /** Whether the standalone map screen is the one currently on screen (mode
   *  === 'map') — since it stays mounted across tab switches (see page.tsx),
   *  this is how it knows to re-force fullscreen on every return visit, not
   *  just its first mount (e.g. after exiting once already reset it false).
   *  Ignored (and unnecessary) when `standalone` isn't set. */
  visible?: boolean
  /** Called whenever the standalone map's fullscreen exits — always
   *  provided when `standalone` is set (either back to the listing it was
   *  opened from, or home otherwise), since a standalone map never just
   *  collapses to a boxed view in place. Unused by the embedded home-screen
   *  map, whose own toggle collapses in place instead. */
  onExitFullscreenToListing?: () => void
  /** Embedded home-screen map only — called when it's sitting expanded and the
   *  viewport narrows to phone width. There's no expanded state to narrow INTO
   *  on mobile (the whole embedded map is `hidden sm:block` on the home screen,
   *  and mobile reaches the map through its own tab instead), so without this
   *  the visitor's fullscreen map would just silently vanish behind the card
   *  grid. Hands off to the real map screen, which is where a full-viewport map
   *  lives on mobile. */
  onPromoteToMapScreen?: () => void
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
  /** Full address-entry + tracking controls, same object the header pill
   *  reads (see LocationProvider). Only needed on desktop: when the map goes
   *  fullscreen (`sm:fixed sm:inset-0 sm:z-50` below) it paints over the
   *  header entirely, taking its LocationControl pill with it, so this
   *  screen surfaces its own copy of the same control while that's the case.
   *  Mobile never loses the header's control this way — its own header is
   *  merely collapsed, not covered, and its pin FAB already reopens the same
   *  popover. Omitted by callers with nowhere to set an address anyway (the
   *  admin category-preview map), which just means no control renders. */
  controls?: LocationControls
}

const NOOP_LIVE_TRACKING = { tracking: false, error: null, start: () => {}, stop: () => {} }

export default function ResourceMapView({ onUp, userLocation, initialCategory, initialQuery, initialSelectedCategories, initialFilters, initialPlaceId, onViewListing, standalone, visible, onExitFullscreenToListing, onPromoteToMapScreen, liveTracking, controls }: Props) {
  const listings = useAllListings()
  const categories = useCategories()
  const hospitals = useHospitals() ?? []
  const { pinned, filterActive: pinnedSelected, setFilterActive: setPinnedSelected } = usePinned()
  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned])
  // Whether the Pinned chip is toggled on — it behaves like one more category
  // chip in the row (see the Pinned button below), not an exclusive "only
  // show pinned" mode: with Pinned AND a category both on, the map shows the
  // union — every pinned place (regardless of its own category) plus every
  // other place in the selected category, exactly as if Pinned really were a
  // category of its own. Lives in PinnedContext, not local state — see
  // filterActive's own doc comment for why.

  // Dropped pins — arbitrary points the visitor marks themselves, not tied
  // to a listing. `pendingDropAt` is the coordinate of a long-press waiting
  // to be named; `editingDroppedId` is an already-saved pin the visitor
  // tapped to rename/remove. At most one editor is ever open, so these don't
  // need to be one combined state.
  const { droppedPins, add: addDroppedPin, remove: removeDroppedPin, rename: renameDroppedPin } = useDroppedPins()
  const [pendingDropAt, setPendingDropAt] = useState<{ lat: number; lng: number } | null>(null)
  const [editingDroppedId, setEditingDroppedId] = useState<string | null>(null)
  const droppedMapPoints = useMemo<SelectablePoint[]>(
    () =>
      droppedPins.map((p) => ({
        id: `${DROPPED_PREFIX}${p.id}`,
        lat: p.lat,
        lng: p.lng,
        name: p.label,
        color: DROPPED_PIN_COLOR,
        glyph: '📍',
        categoryLabel: 'Your pin',
        filterId: DROPPED_FILTER_ID,
      })),
    [droppedPins],
  )
  const { tracking, error: geoError, start, stop } = liveTracking ?? NOOP_LIVE_TRACKING

  // `userLocation` (page.tsx's global coords) already updates continuously
  // once tracking is on — see useLiveLocation — so this screen just reads it
  // directly rather than keeping its own separate live position.
  const activeLocation: LatLng | null = userLocation ?? null

  // Mobile only — the quick chip row over the map shows a handful of
  // categories plus a trailing "More" chip; tapping it opens this full-screen
  // picker with every category, Google-Maps-style.
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  // Measured px height of the map box — the draggable mobile nearby sheet
  // computes its half/full snap points from this rather than the viewport,
  // since the box itself doesn't always fill the viewport.
  // A state-backed callback ref, not useRef — the map box is rendered inside
  // the `loading ? … : …` else-branch below, so on first mount it doesn't
  // exist yet. A plain ref + `[]`-dep effect read null and, having no reason
  // to re-run, never observed the box at all: mapBoxHeight stayed 0, which
  // collapsed the sheet's half/full snap points onto PEEK_PX and left it
  // unable to open at all. Keying the effect off the element itself makes it
  // attach the moment the box mounts. Same pattern as topOverlayEl above.
  const [mapBoxEl, setMapBoxEl] = useState<HTMLDivElement | null>(null)
  const [mapBoxHeight, setMapBoxHeight] = useState(0)
  // Measured on attach rather than waiting for the observer's first callback,
  // so the snap points are usable from the very first frame the box exists.
  const attachMapBox = useCallback((el: HTMLDivElement | null) => {
    setMapBoxEl(el)
    if (el) setMapBoxHeight(el.getBoundingClientRect().height)
  }, [])
  useEffect(() => {
    if (!mapBoxEl) return
    const ro = new ResizeObserver(([entry]) => setMapBoxHeight(entry.contentRect.height))
    ro.observe(mapBoxEl)
    return () => ro.disconnect()
  }, [mapBoxEl])
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
  // Desktop-only — the embedded home-screen map starts as a contained card
  // (like a widget, not the whole page); this expands it to cover the
  // viewport, and collapses it back in place. The standalone page-level map
  // screen has no such boxed state at all — it's always fullscreen — see the
  // effect below. Mobile is already effectively full-bleed either way, so it
  // has no separate fullscreen toggle.
  const [fullscreen, setFullscreen] = useState(!!standalone)
  // Exiting fullscreen: a standalone map always navigates away (back to the
  // listing it was opened from, or home — see onExitFullscreenToListing);
  // the embedded home-screen map just collapses back to its boxed card.
  const exitFullscreen = () => {
    setFullscreen(false)
    onExitFullscreenToListing?.()
  }
  // Re-forces fullscreen every time the standalone map screen becomes the
  // one on screen — not just its first mount. It stays mounted across tab
  // switches (see page.tsx), so without this, returning to it after a
  // previous visit's exit (which always resets fullscreen false) would show
  // the visitor a state that's supposed to not exist for this screen: a
  // standalone map sitting there NOT fullscreen. Covers every entry path —
  // a listing's "Map" button, the mobile tab bar, browser back/forward —
  // uniformly, instead of only the one that happened to trigger the mount.
  useEffect(() => {
    if (!standalone || !visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullscreen(true)
  }, [standalone, visible])
  // The mirror of the above, for the embedded home-screen map: expanded on
  // desktop, then narrowed to phone width. `sm:fixed` stops applying and the
  // whole embedded map is `hidden sm:block` on the home screen, so the visitor's
  // full-viewport map would simply disappear behind the card grid. Hand it to
  // the real map screen instead — the same map, on the screen mobile keeps it.
  useEffect(() => {
    if (standalone || !fullscreen || !isMobile || !onPromoteToMapScreen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullscreen(false)
    onPromoteToMapScreen()
  }, [standalone, fullscreen, isMobile, onPromoteToMapScreen])
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  // Desktop-only — collapses the results sidebar down to just its edge
  // toggle, same as Google Maps' own panel-collapse arrow, so a visitor who
  // wants to see more of the map without losing their search/selection can
  // tuck the panel away without clearing it. Reset to false at the points
  // below where the panel would otherwise reopen with new content anyway
  // (a fresh search, a newly toggled category, a newly selected place) —
  // collapsing should hide what's already there, not swallow the next
  // thing the visitor explicitly asks to see.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Lets the sidebar be opened even before anything's narrowed — without
  // this, first-time visitors land on a bare map with no visible way to
  // browse the (already-loaded) directory at all, since the sidebar
  // otherwise only appears once a search/category narrows things down.
  // Independent of sidebarCollapsed (which hides a sidebar that DOES have a
  // narrowing reason to show); see sidebarVisible/toggleSidebar below for
  // how the two combine.
  const [sidebarOpenedManually, setSidebarOpenedManually] = useState(false)

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
    else {
      setDesktopSelected(p)
      setSidebarCollapsed(false)
    }
  }
  const deselectPlace = () => {
    if (isMobile) nearbySheetRef.current?.deselectPoint()
    else setDesktopSelected(null)
  }

  // Keeps the standalone map screen's own address bar in sync with which pin
  // is open, so a map link is shareable down to the specific place someone
  // had selected — not just the pins and filters mapQueryString already
  // covered. Plain history.replaceState, not next/navigation's router —
  // same choice the existing mapQuery/mapSelected/mapFilters sync above
  // already made (see its own comment), and for the same reason: router.replace
  // re-subscribes every useSearchParams() caller (this component now among
  // them) to the change, and this screen's marker layer already re-renders
  // far more often than its own state actually changes (see the `hospitals`
  // dependency warning on allPoints below) — feeding that back through the
  // router turns a harmless extra render into a real navigation each time.
  // A plain history write has no such feedback loop: nothing subscribes to
  // it, so it only ever affects a future cold load (initialPlaceId) or a
  // copy-pasted address bar.
  useEffect(() => {
    if (!standalone) return
    const next = new URLSearchParams(window.location.search)
    if (selectedPointId) next.set('place', selectedPointId)
    else next.delete('place')
    const qs = next.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (url === `${window.location.pathname}${window.location.search}`) return
    window.history.replaceState(window.history.state, '', url)
  }, [selectedPointId, standalone])
  // Restoring the selection from `initialPlaceId` needs allPoints, which
  // isn't computed yet at this point in the component — see below, right
  // after allPoints itself.
  const restoredInitialPlace = useRef(false)

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
        // The map (pins and this sidebar's nearby list) always shows the
        // category's own icon/image, even for a listing that's uploaded its
        // own photo — that per-listing photo only shows once you're actually
        // looking at the listing (its directory row, or this map's own place
        // detail — see GenericListingCard/MapPlaceDetail, which read
        // PHOTO_FIELD_KEY directly rather than through this point).
        glyphSrc: cat?.iconImageUrl ?? undefined,
        categoryLabel: cat?.label ?? r.category,
        // Same haystack the category directory searches against (name, address,
        // tags, detail fields) — so a query that matches in the directory
        // matches here too.
        searchText: listingSearchText(r, cat),
        raw: r,
        pinned: pinnedIds.has(r.id),
      })
    }
    return out
  }, [listings, categories, colorById, hospitals, pinnedIds])

  // Restores the pin `initialPlaceId` named, once it's actually in allPoints
  // (a plain state initializer would run before listings have loaded).
  // Guarded to fire only once — after that, selectedPointId and the effect
  // above are the source of truth, and re-running this on every allPoints
  // change (e.g. a live-tracking location update touching a memoized array)
  // would re-open a pin the visitor had already closed.
  useEffect(() => {
    if (restoredInitialPlace.current || !standalone || !initialPlaceId) return
    const point = allPoints.find((p) => p.id === initialPlaceId)
    if (!point) return
    restoredInitialPlace.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    selectPlace(point)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints, standalone, initialPlaceId])

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
    if (isOpenNowWord(q)) return []
    // Within each match-quality bucket, closest first when we have a location;
    // otherwise most-upvoted first, so ties don't fall back to storage order.
    const rank = (p: (typeof allPoints)[number]) =>
      activeLocation ? haversineMiles(activeLocation, { lat: p.lat, lng: p.lng }) : -(p.raw?.upvotes ?? 0)
    const byRank = (a: (typeof allPoints)[number], b: (typeof allPoints)[number]) => rank(a) - rank(b)
    // Nothing typed yet — list what's currently on the map given the active
    // category chips, same as Google Maps' own "nearby" suggestions on an
    // empty, focused search box, instead of showing nothing until you type.
    if (q.length === 0) {
      return allPoints
        .filter((p) => effectiveSelected.has(p.filterId))
        .sort(byRank)
        .slice(0, 6)
    }
    if (q.length < 2) return []
    const starts: typeof allPoints = []
    const contains: typeof allPoints = []
    for (const p of allPoints) {
      const name = stripApostrophes(p.name.toLowerCase())
      if (name.startsWith(q)) starts.push(p)
      else if (name.includes(q)) contains.push(p)
    }
    return [...starts.sort(byRank), ...contains.sort(byRank)].slice(0, 6)
  }, [allPoints, input, activeLocation, effectiveSelected])

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
      // Pinned is a UNION with the category chips, not a replacement — a
      // pinned place shows up whether or not its own category chip happens
      // to be on, while an unpinned place in a selected category still
      // shows too (see the Pinned chip's own comment above).
      .filter((p) => effectiveSelected.has(p.filterId) || (pinnedSelected && p.pinned))
      .filter((p) => activeTerms.every((t) => stripApostrophes(p.searchText).includes(t)))
      .filter((p) => !p.raw || filterChips.every((c) => c.test(p.raw as DirectoryResource)))
      .filter((p) => {
        if (!openNowActive || !p.raw) return true
        const keys = hoursKeysByCat.get(p.raw.category)
        return !keys?.length || keys.some((k) => hoursOpenNow(p.raw![k]) === true)
      })
  }, [allPoints, effectiveSelected, activeTerms, filterChips, openNowActive, hoursKeysByCat, pinnedSelected])

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
      setSidebarCollapsed(false)
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

  // Whether every chip in the row — the real categories AND the Pinned chip,
  // when it's showing — is currently on. Mirrors CategoryFilter's own `allOn`
  // (which drives Show all/Hide all's label): the Pinned chip only counts
  // when it actually renders (see pinnedChip below), so a visitor who's
  // never pinned anything isn't blocked from "narrow to just this one" by a
  // chip they can't see.
  const hasPinnedChip = ui.map.pins && pinned.length > 0
  const allChipsOn = effectiveSelected.size === options.length && (!hasPinnedChip || pinnedSelected)

  const toggle = (id: string) => {
    // Starting from "everything shown", a tap on a single chip should narrow
    // straight down to just that category — same as Google Maps' filter
    // chips — rather than requiring "Hide all" first and then re-enabling
    // the one category you actually wanted. Once you've narrowed down,
    // further taps add/remove from that subset as before. Any category's
    // stored filters ride along either way (see clearFiltersForCategories).
    setSidebarCollapsed(false)

    // Picking a category on mobile brings the nearby sheet up to half, the way
    // the Google Maps app does — the results are the point of the tap, and
    // leaving them behind a collapsed handle makes the chip look like it did
    // nothing. Only when the tap SELECTS a category: switching one off is a
    // narrowing gesture, and shoving the sheet up over the map for it would be
    // the opposite of what was asked. `raise` leaves an already-expanded sheet
    // alone, so it can't shrink a list someone deliberately opened.
    const raiseSheet = () => {
      if (isMobile) nearbySheetRef.current?.raise()
    }

    if (allChipsOn) {
      // Narrowing to just this one category also switches Pinned off — same
      // "everything else unclicks" promise the Pinned chip's own tap makes
      // in the other direction (see togglePinnedSelected).
      setSelected(new Set([id]))
      setPinnedSelected(false)
      raiseSheet()
      return
    }
    const next = new Set(effectiveSelected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      raiseSheet()
    }
    setSelected(next)
  }
  // Show all/Hide all cover every chip in the row, Pinned included — not
  // just the real categories — so the button's own "everything is on/off"
  // promise actually holds.
  const showAll = () => {
    setSelected(new Set(options.map((o) => o.id)))
    setPinnedSelected(true)
    setSidebarCollapsed(false)
  }
  // Same "surface the results" side effects toggling a category chip gets
  // (raise the mobile sheet, drop the desktop sidebar's collapse) — without
  // them, turning Pinned on looked like it did nothing when nothing else
  // had already narrowed the map.
  const togglePinnedSelected = () => {
    // Same "narrow to just this one" behavior toggle() gives every category
    // chip when everything's on — Pinned is just another chip in the row
    // (see CategoryFilter's pinnedChip prop), so it has to unclick
    // everything else the same way tapping a category chip would.
    if (allChipsOn) {
      setSelected(new Set())
      setPinnedSelected(true)
      setSidebarCollapsed(false)
      if (isMobile) nearbySheetRef.current?.raise()
      return
    }
    const next = !pinnedSelected
    setPinnedSelected(next)
    if (next) {
      setSidebarCollapsed(false)
      if (isMobile) nearbySheetRef.current?.raise()
    }
  }
  const hideAll = () => {
    setSelected(new Set())
    clearFiltersForCategories(effectiveSelected)
    setPinnedSelected(false)
    setSidebarCollapsed(false)
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
  const desktopNarrowed = selected !== null || committedQuery.length > 0 || filterChips.length > 0 || pinnedSelected

  // Whether the sidebar is actually on screen right now — either because
  // something narrowed the map down (a search, a category, a selected
  // place) or because the visitor opened it manually via the edge toggle —
  // and it hasn't been collapsed. The toggle button always renders (see the
  // JSX below), so there's always a way to pull the panel out, even on a
  // freshly-loaded map with nothing narrowed yet.
  const sidebarVisible = (desktopNarrowed || !!desktopSelected || sidebarOpenedManually) && !sidebarCollapsed
  function toggleSidebar() {
    if (desktopNarrowed || desktopSelected) setSidebarCollapsed((c) => !c)
    else setSidebarOpenedManually((o) => !o)
  }

  // Auto-collapse the sidebar once whatever it was showing disappears —
  // e.g. unchecking the last matching filter leaves zero results. A panel
  // left open with nothing but a "no places" message isn't worth the
  // width; tucking it away automatically matches what the collapse arrow
  // already does on request. Only applies to the results-list case, not a
  // specific selected place (desktopSelected) — that one only goes away
  // when the visitor explicitly backs out of it.
  useEffect(() => {
    if (isMobile || desktopSelected || !desktopNarrowed) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visiblePoints.length === 0) setSidebarCollapsed(true)
  }, [visiblePoints.length, desktopSelected, desktopNarrowed, isMobile])

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

  // A standalone toggle, not one of CategoryFilter's own chips — it narrows
  // ACROSS categories rather than toggling one, so it doesn't belong to
  // that component's select/all/none model. Rendered by CategoryFilter
  // itself, right after Show all/Hide all and before the real category
  // chips — it's the most important shortlist, not just another category.
  // Hidden until there's at least one pin: an always-visible "Pinned 0"
  // that narrows the map to nothing isn't a useful default state for a
  // feature nobody's touched yet.
  const pinnedChip = ui.map.pins && pinned.length > 0 && (
    <div
      className={`relative flex shrink-0 items-stretch rounded-full border text-xs font-medium transition-colors ${
        pinnedSelected ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-500'
      }`}
      // Same blue as the pin badge overlaid on a pinned marker (see
      // ResourceMap's buildPin) — Pinned isn't a real category with its own
      // hue, but this chip should still read with exactly the same weight
      // (size, dot, count) as one, not a lighter/different-shaped control.
      style={pinnedSelected ? { backgroundColor: '#2563eb' } : undefined}
    >
      <button
        onClick={togglePinnedSelected}
        aria-pressed={pinnedSelected}
        className={`flex items-center gap-1 py-1 pl-2.5 pr-2.5 rounded-full cursor-pointer ${pinnedSelected ? '' : 'hover:bg-slate-50'}`}
      >
        <span
          className="inline-block h-2 w-2 rounded-full ring-1 ring-white/60"
          style={{ backgroundColor: pinnedSelected ? 'rgba(255,255,255,0.9)' : '#2563eb' }}
          aria-hidden="true"
        />
        <span aria-hidden="true">📌</span>
        <span>Pinned</span>
        <span className={pinnedSelected ? 'text-white/80' : 'text-slate-400'}>{pinned.length}</span>
      </button>
    </div>
  )

  // The category chips — sit beside the search box (not below it), so they
  // stay put next to it even while the dropdown is open, same as Google
  // Maps' own chip row.
  const desktopCategoryChips = options.length > 0 && (
    <CategoryFilter
      options={optionsWithFilters}
      selected={effectiveSelected}
      onToggle={toggle}
      onAll={showAll}
      onNone={hideAll}
      categories={categories ?? []}
      points={allPoints}
      boolFields={boolFields}
      onToggleBool={toggleBoolField}
      selectFilters={selectFilters}
      onToggleSelectValue={toggleSelectValue}
      pinnedChip={pinnedChip}
      pinnedOn={pinnedSelected}
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
          {/* ── Desktop sidebar — mounts once there's ANY reason to (a
                  search, a narrowed category, a selected place, or the
                  visitor manually pulling it out via the edge toggle below);
                  its actual on-screen width is governed by sidebarVisible,
                  which also accounts for sidebarCollapsed. Kept as a
                  separate mount condition from sidebarVisible (which also
                  requires !sidebarCollapsed) so the width transition has
                  something to animate FROM/TO — unmounting it outright
                  wouldn't animate, it'd just vanish. ────────────────────── */}
          {!isMobile && (desktopNarrowed || !!desktopSelected || sidebarOpenedManually) && (
            <aside
              className={`hidden shrink-0 flex-col overflow-hidden bg-white transition-[width] duration-200 ease-in-out sm:flex sm:min-h-0 ${
                sidebarVisible ? 'sm:w-[380px] sm:border-r sm:border-slate-200' : 'sm:w-0'
              }`}
            >
              {/* No search/chips header here anymore — the floating bar
                  (rendered once, below, positioned relative to the whole
                  row) sits on top of this panel instead, so it never has to
                  resize or relocate when this panel appears. This spacer is
                  a real layout sibling (not just padding on the scroll area
                  below) so it reserves that space permanently — padding
                  alone would only clear it on first paint; once scrolled,
                  list rows would slide up underneath the floating bar since
                  padding is part of the same scrolling content. ────────── */}
              <div className="h-16 shrink-0" />
              {ui.map.nearbyList && (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {desktopSelected && desktopSelected.raw && desktopSelectedCategory ? (
                    <MapPlaceDetail
                      item={desktopSelected.raw}
                      category={desktopSelectedCategory}
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

          {/* ── Sidebar collapse toggle (desktop) — sits just outside the
                  sidebar's edge, same idea as Google Maps' own panel-collapse
                  arrow, so the map can take over the full width without
                  losing whatever search/selection the sidebar was showing.
                  Fully on the map side (not straddling the border) rather
                  than centered on it — centering it on the edge meant, once
                  collapsed, half the button sat past x=0 and got clipped by
                  this row's own overflow-hidden (unreachable to click), and
                  even expanded it sat exactly where the results list's own
                  scrollbar renders, fighting with it. Its left offset still
                  tracks the sidebar's width (380px open, 0 collapsed) so it
                  slides along with the edge instead of jumping.
                  Always rendered (not just once something's narrowed) — a
                  freshly-loaded map with nothing searched/selected yet
                  otherwise has no visible way to browse the directory at
                  all beyond the map's own pins. Clicking it here pulls the
                  sidebar out to show everything currently on the map (see
                  sidebarOpenedManually above). ─────────────────────────── */}
          {!isMobile && (
            <button
              onClick={toggleSidebar}
              aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
              aria-pressed={!sidebarVisible}
              style={{ left: (sidebarVisible ? 380 : 0) + 8 }}
              className="absolute top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-[left] duration-200 ease-in-out hover:bg-slate-50 hover:text-slate-700 cursor-pointer sm:flex"
            >
              <ChevronLeftIcon className={`h-4 w-4 transition-transform ${sidebarVisible ? '' : 'rotate-180'}`} />
            </button>
          )}

          {/* ── Floating search + chips (desktop) — positioned relative to
                  the whole row (not the map div, and not inside the sidebar
                  above), so it sits in the exact same spot whether or not
                  the sidebar is showing. It floats on top of the sidebar
                  when the sidebar's present (see that panel's own pt-16,
                  which clears space for this) or directly on the map when
                  it's not — never resizing or relocating either way, unlike
                  having two separate copies. ─────────────────────────────── */}
          {!isMobile && (
            // right-16 (not right-3): leaves clearance so the chip row's
            // scroll area doesn't run under the fullscreen button, which
            // shares this same top-right corner of the map.
            <div className="absolute left-3 right-16 top-3 z-20 hidden items-start gap-2 sm:flex">
              <div className="w-72 shrink-0">{desktopSearchForm}</div>
              {desktopCategoryChips && <div className="min-w-0 flex-1 pt-0.5">{desktopCategoryChips}</div>}
            </div>
          )}

          {/* ── Map. Mobile: full-bleed (breaks out of the page's max-width/
                  padding) and fills the rest of the flex column (flex-1) —
                  genuinely edge to edge, right up to the header, since
                  search/filters float ON the map itself instead of pushing it
                  down. Desktop: fills everything to the right of the sidebar,
                  same edge-to-edge treatment, no boxed card — same as Google
                  Maps. ────────────────────────────────────────────────────── */}
          <div
            ref={attachMapBox}
            className="relative left-1/2 flex min-h-[320px] w-screen flex-1 -translate-x-1/2 flex-col overflow-hidden sm:left-0 sm:min-h-0 sm:w-auto sm:translate-x-0"
          >
              <ResourceMap
                points={ui.map.pins ? [...visiblePoints, ...droppedMapPoints] : visiblePoints}
                userLocation={activeLocation}
                follow={follow}
                onResumeFollow={() => setFollow(true)}
                onManualDrag={() => setFollow(false)}
                onViewListing={onViewListing}
                onSelectPoint={(p) => {
                  const sp = p as SelectablePoint
                  // A dropped pin isn't a listing — open its own name/remove
                  // editor instead of routing into the nearby-list/sidebar
                  // detail flow selectPlace drives for real places.
                  if (sp.filterId === DROPPED_FILTER_ID) {
                    setEditingDroppedId(sp.id.slice(DROPPED_PREFIX.length))
                    return
                  }
                  selectPlace(sp)
                }}
                onDeselectPoint={deselectPlace}
                onBackgroundClick={() => (isMobile ? nearbySheetRef.current?.lower() : setDesktopSelected(null))}
                onMapLongPress={ui.map.pins ? (coords) => setPendingDropAt(coords) : undefined}
                searchActive={searchActive}
                selectedId={selectedPointId}
                obscuredBottomPx={isMobile ? sheetHeightPx : 0}
                obscuredTopPx={isMobile ? topOverlayHeight : 0}
              />

              {/* ── Fullscreen toggle (desktop only) — the map starts as a
                      contained card; this expands it to cover the viewport
                      (Escape, or tapping it again, collapses it back — or,
                      arriving from a listing's Map button, exits straight
                      back to that listing; see exitFullscreen). ─────────── */}
              <button
                onClick={() => (fullscreen ? exitFullscreen() : setFullscreen(true))}
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

              {/* ── Address entry (desktop, fullscreen only) — the fullscreen
                      map (see the `fullscreen` className above) is `sm:fixed
                      sm:inset-0 sm:z-50`, which paints directly over the site
                      header and, with it, the only other place a visitor can
                      type an address. Below fullscreen the header is still
                      right there above the map, so this would just be a
                      redundant second copy of the same control. Same
                      component the header uses, not a bespoke one — reusing
                      it keeps "where should distances be measured from"
                      behaving identically everywhere it appears. ────────── */}
              {!isMobile && fullscreen && controls && (
                <div className="absolute right-3 top-14 z-20 hidden sm:block">
                  <LocationControl controls={controls} />
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
                        points={allPoints}
                        boolFields={boolFields}
                        onToggleBool={toggleBoolField}
                        selectFilters={selectFilters}
                        onToggleSelectValue={toggleSelectValue}
                        pinnedChip={pinnedChip}
                        pinnedOn={pinnedSelected}
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

              {/* Mobile-only "set/change your location" FAB. Opens the same
                  header popover as AddressPrompt, via the TOGGLING
                  'jpc:toggle-location' event rather than AddressPrompt's
                  plain "open" one — this is a standing button a visitor can
                  tap again while the popover is already up, and a second tap
                  should close it, not re-open what's already open — rather
                  than jumping straight into requesting GPS: a visitor who'd
                  rather type an address gets that choice instead of a
                  permission prompt they didn't ask for.
                  Always rendered, not just while there's no anchor yet — this
                  used to disappear the moment a location was set (ResourceMap
                  draws its own "Re-center"/"Following" pill in the same slot
                  once activeLocation exists), which meant there was no way to
                  change your mind on this screen once you'd shared a location
                  or typed an address: the header pill that would normally do
                  that is itself collapsed away here (see MapScreen).
                  Fixed position/size regardless of activeLocation — it used
                  to jump to a smaller, higher slot once a location was set,
                  to stay clear of the Following/Re-center pill in this same
                  bottom-right corner. That pill now lives bottom-LEFT instead
                  (see ResourceMap), specifically so this FAB never has to
                  move for it; the only other bottom-right neighbor, the
                  mobile "Stop tracking" pill below, sits well clear of this
                  one's height already.
                  Not gated on ui.map.liveTracking: unlike the old FAB this
                  replaced, tapping it doesn't itself start tracking — it just
                  opens the picker, which offers an address either way. */}
              <button
                onClick={() => document.dispatchEvent(new CustomEvent('jpc:toggle-location'))}
                aria-label={activeLocation ? 'Change your location' : 'Set your location'}
                className="absolute bottom-[4.75rem] right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg shadow-md ring-1 ring-slate-900/10 cursor-pointer sm:hidden"
              >
                <span aria-hidden="true">📍</span>
              </button>
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

      {/* ── Dropped-pin naming/editing — a long-press on empty map (see
              onMapLongPress above) opens this with pendingDropAt set; tapping
              an already-placed one opens it with editingDroppedId instead.
              Never both at once. ──────────────────────────────────────── */}
      {pendingDropAt && (
        <DroppedPinEditor
          onSave={(label) => {
            addDroppedPin({ id: crypto.randomUUID(), lat: pendingDropAt.lat, lng: pendingDropAt.lng, label })
            setPendingDropAt(null)
          }}
          onCancel={() => setPendingDropAt(null)}
        />
      )}
      {editingDroppedId && (() => {
        const pin = droppedPins.find((p) => p.id === editingDroppedId)
        // The pin was removed (e.g. from another tab) between the tap and
        // this render — nothing left to edit.
        if (!pin) return null
        return (
          <DroppedPinEditor
            initialLabel={pin.label}
            onSave={(label) => {
              renameDroppedPin(pin.id, label)
              setEditingDroppedId(null)
            }}
            onDelete={() => {
              removeDroppedPin(pin.id)
              setEditingDroppedId(null)
            }}
            onCancel={() => setEditingDroppedId(null)}
          />
        )
      })()}
    </div>
  )
}
