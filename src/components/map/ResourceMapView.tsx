'use client'

import { track } from '@vercel/analytics'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MapPoint } from './ResourceMap'
import { createHighlight } from './highlight'
import CategoryFilter from './CategoryFilter'
import MapFiltersSheet, { type MapFilterSection } from './MapFiltersSheet'
import NearbyList from './NearbyList'
import MapPlaceDetail from './MapPlaceDetail'
import MobileNearbySheet, { type MobileNearbySheetHandle } from './MobileNearbySheet'
import type { HostedEditor } from '@/components/resources/ListingEditor'
import { useAllListings } from '@/lib/useAllListings'
import { useCategories } from '@/lib/useCategories'
import { selectValues } from '@/lib/categories'
import {
  filterCount,
  filterFields,
  keepsHours,
  openNowAll,
  passesFields,
  setOpenNowFor,
  toggleBool,
  toggleOpenNow,
  toggleSelect,
  writeMapFilters,
} from '@/lib/mapFilters'
import { useHospitals } from '@/lib/useHospitals'
import { useIsMobile } from '@/lib/useIsMobile'
import type { LatLng } from '@/lib/googleMapsLinks'
import { useNow } from '@/lib/useNow'
import { ui } from '@/lib/uiConfig'
import { usePinned } from '@/lib/pinnedContext'
import { CURRENT_LOCATION_LABEL } from '@/lib/useLiveLocation'
import { useDroppedPins } from '@/lib/droppedPinsContext'
import { useMapSidebar } from './useMapSidebar'
import { useCampaignBanners } from '@/lib/contentContext'
import { activeCampaignBanner } from '@/lib/campaignBanner'
import { mapQueryString } from '@/lib/routes'
import { countEvent } from '@/lib/countEvent'
import { useOptionalCommunitySlug, useCommunityTimezone } from '@/lib/communityContext'
import type { DirectoryResource } from '@/types'
import { useKeptListScroll } from './useKeptListScroll'
import { useRouter } from 'next/navigation'
import { moveBackTo } from '@/components/admin/useScreenHistory'
import { stepCount, stepsIn, withoutSteps } from '@/lib/stepAddress'
import {
  DROPPED_FILTER_ID,
  DROPPED_PIN_COLOR,
  DROPPED_PREFIX,
  ERUV_FILTER_ID,
  ERUV_PREFIX,
  HOSPITALS_ID,
  NOOP_LIVE_TRACKING,
  mapShellClass,
  normalizeSearch,
  openNowIdsFor,
  resolveInitialSelected,
  stripApostrophes,
  type ResourceMapViewProps,
  type SelectablePoint,
} from './mapViewShared'
import { MapWithHover, SearchSuggestions } from './mapViewParts'
import { useMapPoints } from './useMapPoints'
import { useMapSearch } from './useMapSearch'
import { useMapFilters } from './useMapFilters'
import { useViewFromLink } from './useViewFromLink'
import { useMapCategories } from './useMapCategories'
import { useMapEruvim } from './useMapEruvim'
import { CampaignChip, EruvButton, FiltersButton, PinnedChip } from './mapChips'
import DesktopSearchForm from './DesktopSearchForm'
import MobileMapSearch from './MobileMapSearch'
import { DesktopTrackingButton, MobileRecenterButton } from './LocationButtons'
import CategoriesPickerScreen from './CategoriesPickerScreen'
import DroppedPinEditors from './DroppedPinEditors'
import DesktopMapChrome from './DesktopMapChrome'
import { DesktopSidebar, SidebarScroll } from './DesktopSidebar'

type Props = ResourceMapViewProps


export default function ResourceMapView({ userLocation, initialCategory, initialQuery, initialSelectedCategories, initialPinned = false, initialEruvim, initialFilters, initialPlaceId, viewSearch, backTo, onViewListing, standalone, visible, onExitFullscreenToListing, liveTracking, controls }: Props) {
  const timezone = useCommunityTimezone()
  const listings = useAllListings()
  const categories = useCategories()
  // Admin-configured cap on how far a point can be from the anchor and still
  // drive the map's automatic "fit everything" zoom — lives on the Map
  // pseudo-category's own row (edited from its own entry in the admin
  // Categories tab), not a general site setting. See ResourceMap's own
  // zoomRadiusMiles prop for what this actually changes.
  const mapZoomRadiusMiles = categories?.find((c) => c.kind === 'map')?.mapZoomRadiusMiles ?? null
  const hospitalsData = useHospitals()
  const { pinned, toggle: togglePinnedListing, filterActive: pinnedSelected, setFilterActive: setPinnedSelected } = usePinned()
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
        categoryLabel: 'Your pin',
        filterId: DROPPED_FILTER_ID,
      })),
    [droppedPins],
  )
  const { tracking, start, stop } = liveTracking ?? NOOP_LIVE_TRACKING

  // `userLocation` (page.tsx's global coords) already updates continuously
  // once tracking is on — see useLiveLocation — so this screen just reads it
  // directly rather than keeping its own separate live position.
  const activeLocation: LatLng | null = userLocation ?? null

  // Origin for a pin's "Directions ↗" link — prefers the visitor's typed
  // address (controls.address) over raw coordinates, since Maps renders a
  // bare lat/lng origin as an anonymous "Dropped pin" rather than a
  // recognizable place. Gated on controls.coords too — free-typed text the
  // visitor never picked a suggestion for (or that never resolved) isn't a
  // real place Maps can route to, so this falls back to raw coords the same
  // way it already does for live tracking's "Current location" label. Same
  // reasoning as LocationContextValue.directionsOrigin, duplicated here
  // rather than read from context because this screen also renders inside
  // the admin's category-preview map, which has no LocationProvider and
  // supplies `controls`/`liveTracking` as plain props instead.
  const directionsOrigin: string | LatLng | null =
    !tracking && controls?.coords && controls.address && controls.address !== CURRENT_LOCATION_LABEL
      ? controls.address
      : activeLocation

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
  const countCommunity = useOptionalCommunitySlug()
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
  // The sidebar row under the pointer, whose pin lifts on the map (Oct 16,
  // as a category page's map does). A store rather than state, so moving
  // down the list redraws the map's pins and not the whole view.
  const [hover] = useState(createHighlight)
  // Bumped only when the current selectedPointId change should reframe the
  // map's camera (a listing picked from the sheet/sidebar list) — left alone
  // for a pin tapped directly on the map, so that tap just highlights the
  // marker without moving a view the visitor already positioned themselves.
  // See ResourceMap's own frameToken prop doc for how it's consumed.
  const [frameToken, setFrameToken] = useState(0)
  // Desktop's equivalent of MobileNearbySheet's own `selected` state — the
  // place currently shown in the sidebar's detail panel (MapPlaceDetail)
  // instead of its results list. Mobile keeps its own copy of this inside
  // MobileNearbySheet; desktop has no such child component (the sidebar is
  // built directly in this file) so it's tracked here instead.
  const [desktopSelected, setDesktopSelectedRaw] = useState<SelectablePoint | null>(null)
  // Also keeps selectedPointId (the marker-highlight id ResourceMap reads,
  // shared with mobile's own selection) in sync — set together, right where
  // the selection itself changes, rather than via a separate effect.
  // The sidebar's place (or eruv) open in its editor: how to step back, what
  // that step is called, and whether anything typed would be lost. Its ‹ is
  // the ← in the search box (Oct 15). Keyed on the place's id so it can't
  // outlive the place it was set for. Mirrored in a ref so leaveEditThen,
  // reached through several handlers in one click, asks only once.
  const [editor, setEditor] = useState<(HostedEditor & { id: string }) | null>(null)
  const editorRef = useRef(editor)
  useLayoutEffect(() => {
    editorRef.current = editor
  })
  const desktopEditing = !isMobile && !!editor && editor.id === desktopSelected?.id
  const desktopSelectedId = desktopSelected?.id ?? null
  const onPlaceEditor = useCallback(
    (next: HostedEditor | null) => setEditor(next && desktopSelectedId ? { ...next, id: desktopSelectedId } : null),
    [desktopSelectedId],
  )
  // A place opened on the computer's map is an entry in the history, as on
  // a phone (MobileNearbySheet): Back closes it rather than leaving the map
  // and its search (Nov 18). Not when the address names it already (a
  // link, a reload). Closed on the screen, it takes that entry back, and
  // the popstate listener below clears it.
  const setDesktopSelected = (p: SelectablePoint | null) => {
    const stepped = (window.history.state as { mapPlaceOpen?: boolean } | null)?.mapPlaceOpen
    if (!p && stepped && standalone) {
      window.history.back()
      return
    }
    if (p && !desktopSelected && !stepped && standalone && new URLSearchParams(window.location.search).get('place') !== p.id) {
      window.history.pushState({ ...(window.history.state ?? {}), mapPlaceOpen: true }, '')
    }
    setDesktopSelectedRaw(p)
    setSelectedPointId(p?.id)
  }
  const onPlacePop = useEffectEvent((e: PopStateEvent) => {
    if (isMobile || !desktopSelected || (e.state as { mapPlaceOpen?: boolean } | null)?.mapPlaceOpen) return
    setDesktopSelectedRaw(null)
    setSelectedPointId(undefined)
  })
  useEffect(() => {
    if (!standalone) return
    const listener = (e: PopStateEvent) => onPlacePop(e)
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [standalone])
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
  // Standalone skips the setFullscreen(false) entirely — that screen has no
  // boxed state to collapse into (see the `standalone` prop's own doc), so
  // flipping it just rendered one frame of the embedded/boxed layout before
  // the navigation below unmounted this component, a visible flash of a
  // "small map" on Escape (or the fullscreen-toggle button) that a real user
  // reported seeing. Leaving `fullscreen` true keeps this screen showing its
  // real layout right up until it's replaced.
  // Mid-edit, the place's editor has entries of its own (?editing=<id>~listing,
  // and its Request removal on top; useEditorInAddress), so a router.back()
  // would only go back over one of those: ✕ took you out of editing and
  // left you on the map. Go back over them first, then leave. Nothing asks
  // "discard?", the same as closing the listing dialog mid-edit.
  const router = useRouter()
  const unwindEditorHistory = (then: () => void) => {
    const editing = () => stepCount(window.location.search, ['editing'])
    if (editing() === 0) return then()
    void moveBackTo(router, editing, () => withoutSteps(window.location.pathname, window.location.search, ['editing']), { keepState: true }).then(then)
  }
  const exitFullscreen = () => {
    const leave = () => {
      if (!standalone) setFullscreen(false)
      onExitFullscreenToListing?.()
    }
    if (onExitFullscreenToListing) unwindEditorHistory(leave)
    else leave()
  }
  // Something else taking the sidebar mid-edit (a search, a pin, the map's
  // background, an eruv): asks first if anything's been typed, then
  // unwinds the editor's history entries — left behind, Back would land in
  // an edit of whatever's showing by then — and only then does it. The ←
  // and Escape step back without asking, as the editor's own ‹ always has;
  // so does ✕ (exitFullscreen). A phone's sheet hosts its editor itself,
  // telling nobody, so there it's the address that says one is open: a pin
  // tapped then swaps the place in the same entry, and the editor's entries
  // would have stayed on top of the next place (Nov 19).
  //
  // `to`: the place being opened, by the id its editor goes by. The one
  // whose editor the address names is no leaving: the restore below picks
  // it again once the editor's own entry lands (a navigation, so the map
  // hears of the place for the first time) and after a reload, and
  // unwinding there closed the editor it had just opened.
  const leaveEditThen = (then: () => void, to?: string) => {
    if (to !== undefined && stepsIn(window.location.search, 'editing', to).length > 0) return then()
    const open = editorRef.current
    if (!open) return unwindEditorHistory(then)
    if (open.changed && !window.confirm('Discard your changes?')) return
    editorRef.current = null
    setEditor(null)
    unwindEditorHistory(then)
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
  // Escape steps back one level at a time (Oct 15, board "A"): a place
  // open in the desktop sidebar goes back to the results first, the same as
  // the ← in the search box; only then does it leave the map. The search
  // box's own Escape (closing its suggestions) is its own level too, so it
  // marks the event handled and nothing behind it moves.
  // While a place is being edited, Escape steps back inside the editor
  // (out of Request removal, then out of the edit), as its ‹ does — never
  // straight to the results, which dropped the edit without a word.
  const onEscape = useEffectEvent(() => {
    if (desktopEditing) editor.back()
    else if (!isMobile && desktopSelected) setDesktopSelected(null)
    else exitFullscreen()
  })
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      // A dialog open over the map (the Filters sheet) closes on its own
      // Escape; the same key mustn't also close the map behind it.
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"]')) onEscape()
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

  // Desktop sidebar's own width/collapse/opened-manually/drag state — see
  // useMapSidebar's own top comment for why sidebarVisible/toggleSidebar
  // (which need desktopNarrowed, not computable this early) stay here
  // instead of living in that hook.
  const {
    sidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarOpenedManually,
    setSidebarOpenedManually,
    isDraggingSidebar,
    onSidebarHandlePointerDown,
    onSidebarHandlePointerMove,
    onSidebarHandlePointerUp,
    onSidebarHandlePointerCancel,
    onSidebarHandleKeyDown,
  } = useMapSidebar()

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
  // desktop's sidebar detail panel. `frame` (default true) says whether this
  // selection should also reframe the map camera; every caller here is a
  // list/sidebar/search pick, so it stays on unless a caller opts out — see
  // the pin-tap handler passed to ResourceMap below, which is the one place
  // that does.
  const selectPlace = (p: SelectablePoint, frame = true) =>
    leaveEditThen(
      () => {
        if (p.raw?.id && countCommunity) countEvent(countCommunity, 'listing_view', p.raw.id)
        if (isMobile) nearbySheetRef.current?.selectPoint(p, frame)
        else {
          setDesktopSelected(p)
          setSidebarCollapsed(false)
          if (frame) setFrameToken((t) => t + 1)
        }
      },
      // An eruv's editor goes by the eruv's own id, a listing's by its.
      p.id.startsWith(ERUV_PREFIX) ? p.id.slice(ERUV_PREFIX.length) : (p.raw?.id ?? p.id),
    )
  const deselectPlace = () => {
    if (isMobile) nearbySheetRef.current?.deselectPoint()
    else leaveEditThen(() => setDesktopSelected(null))
  }

  // Press-and-hold a marker to toggle it Pinned, without opening its card —
  // a shortcut alongside the existing PinButton inside the full detail view
  // (MapPlaceDetail), for shortlisting a place without drilling into it
  // first. Hospitals and dropped pins aren't real directory listings (no
  // `filterId`/a synthetic one), so there's no categoryId a PinnedListing
  // could hold for them — long-pressing those is a no-op instead of
  // corrupting the pinned list with a fake category.
  const handleLongPressPoint = (p: MapPoint) => {
    const sp = p as SelectablePoint
    if (!sp.filterId || sp.filterId === HOSPITALS_ID || sp.filterId === DROPPED_FILTER_ID) return
    togglePinnedListing({ id: sp.id, categoryId: sp.filterId })
  }

  // Restoring the selection from `initialPlaceId` needs allPoints, which
  // isn't computed yet at this point in the component — see below, right
  // after allPoints itself.
  const restoredInitialPlace = useRef<'phone' | 'desktop' | null>(null)
  // Once a showing, not once a mount: this screen is kept mounted while
  // another shows, so a second listing's map tile came back to the first
  // place's sheet (Nov 17). Hiding runs effects' cleanups; showing again
  // runs the restore below afresh with the new address's place.
  useEffect(
    () => () => {
      restoredInitialPlace.current = null
    },
    [],
  )

  const { colorById, allPoints, mappablePinnedCount, options } = useMapPoints({ categories, listings, hospitalsData, pinnedIds })

  // Restores the pin `initialPlaceId` named, once it's actually in allPoints
  // (a plain state initializer would run before listings have loaded).
  // Guarded to fire only once — after that, selectedPointId and the effect
  // above are the source of truth, and re-running this on every allPoints
  // change (e.g. a live-tracking location update touching a memoized array)
  // would re-open a pin the visitor had already closed.
  //
  // Once more on a phone: useIsMobile starts false on every mount and is
  // corrected a render later, so the first try can land in the desktop
  // panel a phone never shows, and the place was simply lost (a hotel's
  // "See them on the map", Oct 6; the same trap the commit effect below
  // describes). Retried only while that first selection still stands.
  useEffect(() => {
    if (!standalone || !initialPlaceId) return
    const retryOnPhone = restoredInitialPlace.current === 'desktop' && isMobile && desktopSelected?.id === initialPlaceId
    if (restoredInitialPlace.current && !retryOnPhone) return
    const point = allPoints.find((p) => p.id === initialPlaceId)
    if (!point) return
    restoredInitialPlace.current = isMobile ? 'phone' : 'desktop'
    if (retryOnPhone) setDesktopSelected(null)
    selectPlace(point)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints, standalone, initialPlaceId, isMobile])

  // initialSelectedCategories (a full toggle set restored from history after
  // browser back) takes precedence over initialCategory (the single-category
  // arrival case from a directory's "Map" button).
  const [selected, setSelected] = useState<Set<string> | null>(
    resolveInitialSelected(initialSelectedCategories, initialCategory, initialPinned, initialEruvim),
  )
  // Eruv lines (see "Eruv lines" below).
  const [eruvimOn, setEruvimOn] = useState(!!initialEruvim)
  // The Pinned chip lives in PinnedContext (it outlives this screen); a link
  // that says to show the pins turns it on.
  // The lines alone mean no pins either.
  useEffect(() => {
    if (initialPinned) setPinnedSelected(true)
    else if (initialEruvim === 'only') setPinnedSelected(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPinned])
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
  const initialQueryText = initialQuery ?? ''
  // Handed to LocationControl (via the 'jpc:toggle-location' event's detail)
  // so its popover can anchor directly under THIS button — the header's own
  // trigger pill is invisible on this screen (see useCollapseHeader), so
  // LocationControl has no DOM position of its own to hang the popover from
  // here otherwise.
  const locationButtonRef = useRef<HTMLButtonElement>(null)
  const {
    input,
    setInput,
    committedQuery,
    setCommittedQuery,
    setSearchFocused,
    mobileSearchInputRef,
    desktopSearchInputRef,
    searchSuggestions,
    typedNothing,
    searchedNothing,
    nothingBox,
    showOpenNowSuggestion,
    dropdownShown,
    selectOpenNow,
    suppressNextCommitEffectRef,
    selectSuggestion,
    submitSearch,
    clearSearch,
    activeTerms,
    askIds,
    foundOnPoint,
  } = useMapSearch({
    initialQueryText,
    allPoints,
    activeLocation,
    effectiveSelected,
    categories,
    listings,
    countCommunity,
    openNowEverywhere,
    selectPlace,
    leaveEditThen,
    isMobile,
    nearbySheetRef,
    setDesktopSelected,
  })
  const {
    initialFiltersQuery,
    filtersForCategory,
    setOwnFilters,
    setBaseFilters,
    filters,
    hasFilters,
    filtersKey,
    updateFilters,
    filtersOpen,
    setFiltersOpen,
  } = useMapFilters({ initialFilters, initialCategory, initialSelectedCategories, categories })

  const { thisRender, applyingRenderRef, ownWritesRef, appliedInitialViewKeyRef } = useViewFromLink({
    initialSelectedCategories,
    initialCategory,
    initialPinned,
    initialEruvim,
    initialQueryText,
    initialFilters,
    initialFiltersQuery,
    filtersForCategory,
    viewSearch,
    setSelected,
    setPinnedSelected,
    setEruvimOn,
    setInput,
    setCommittedQuery,
    setOwnFilters,
    setBaseFilters,
  })

  // Filterable hours-field keys per category, for the open-now predicate.
  const hoursKeysByCat = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of categories ?? []) {
      m.set(c.id, c.detailFields.filter((f) => f.type === 'hours' && f.filterable).map((f) => f.key))
    }
    return m
  }, [categories])

  // "Open now" has to re-answer as the clock moves: a pin that closed at 6pm
  // should drop off a filtered map at 6pm, not when the visitor next reloads.
  const clock = useNow()

  // Whether a listing passes its own category's filters, bar Open now (see
  // openNowIds below, which has the clock).
  const passesOwnFilters = useCallback((r: DirectoryResource) => passesFields(r as unknown as Record<string, unknown>, filters[r.category]), [filters])

  // Each category's chip counts what its filters leave (73, or 5 with Meat,
  // Keystone-K and Open now on); nothing else about the chip changes.
  const optionsWithFilters = useMemo(() => {
    if (!hasFilters) return options
    const open = new Set(openNowIdsFor(allPoints, filters, clock, hoursKeysByCat))
    return options.map((o) => {
      const f = filters[o.id]
      if (!f) return o
      const count = allPoints.filter((p) => p.filterId === o.id && (!p.raw || (passesOwnFilters(p.raw) && (!f.openNow || open.has(p.id))))).length
      return { ...o, count }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, filtersKey, allPoints, passesOwnFilters, hoursKeysByCat, clock])

  // Keeps the standalone map screen's own address bar in sync with the
  // category chips, committed search/filters, and selected pin — so a
  // shared map link (or hitting browser Back) reopens the exact same view,
  // the same way a category directory's own filters/search already round-
  // trip through its URL. mapQueryString is the same builder viewMapForCategory
  // uses for the initial navigation there, so a link built by either one
  // reads back identically via parseMapQuery.
  //
  // Plain history.replaceState, not next/navigation's router: router.replace
  // turns every write into a real navigation, and this screen's marker layer
  // already re-renders more often than its own state actually changes. A
  // history write is lighter, but it is NOT unobserved: in this Next version
  // it feeds useSearchParams, so MapScreen hands it straight back as new
  // initial* props. The resync effect above ignores those echoes
  // (ownWritesRef); without that, a late echo put a cleared search back.
  //
  // Persists committedQuery, not the live `input`, so this doesn't fire on
  // every keystroke — only once a search is actually committed.
  //
  // "All" (showAll) doesn't set `selected` back to null — it sets it to a
  // Set holding every current option's id (see its own comment on why: a
  // fresh reference has to flow through effectiveSelected either way to
  // avoid a stale-Set bug). Left as-is here, that would spell out every
  // category id in the URL instead of just omitting `cat` the way the
  // pristine "nothing tapped yet" state already does — allSelected treats
  // both the same, since they mean the same thing.
  const allSelected = !selected || (selected.size === options.length && options.every((o) => selected.has(o.id)))
  useEffect(() => {
    if (!standalone) return
    // Not in the commit that applies a link: its state is the last view's
    // until the next render, and writing it would put that view back over
    // the link's address (see the re-sync above).
    if (applyingRenderRef.current === thisRender) return
    const written = writeMapFilters(filters, categories ?? [])
    const qs = mapQueryString({
      categories: allSelected ? null : Array.from(selected ?? []),
      query: committedQuery || null,
      openNow: written.open === '1',
      openIn: written.open && written.open !== '1' ? written.open.split(',') : null,
      bool: written.is ? written.is.split(',') : null,
      select: written.sel ? Object.fromEntries(written.sel.split(',').map((pair) => [pair.slice(0, pair.indexOf(':')), pair.slice(pair.indexOf(':') + 1).split('|')])) : null,
      place: selectedPointId ?? null,
      pinned: pinnedSelected && !allSelected,
      // The lines alone say so: no `cat` would mean every category.
      eruvim: eruvimOn && selected?.size === 0 && !pinnedSelected ? 'only' : eruvimOn,
      // Where the visitor came from stays for as long as they're here, so
      // the ‹ back is still there after a chip or a pin.
      from: new URLSearchParams(window.location.search).get('from'),
    })
    // A place's editor open over it keeps its own step (useEditorInAddress).
    const params = new URLSearchParams(qs)
    const editing = new URLSearchParams(window.location.search).get('editing')
    if (editing) params.set('editing', editing)
    const search = params.toString()
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`
    if (url === `${window.location.pathname}${window.location.search}`) return
    window.history.replaceState(window.history.state, '', url)
    ownWritesRef.current = [...ownWritesRef.current, normalizeSearch(new URL(url, window.location.origin).search)].slice(-20)
    // The view is the visitor's now, no link's: the same link again is a
    // new navigation, even if this write never comes back as props (Next
    // doesn't always echo one).
    appliedInitialViewKeyRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, committedQuery, selected, allSelected, filtersKey, categories, selectedPointId, pinnedSelected, eruvimOn, options])

  // "Open now" has to re-answer as the clock moves — a pin that closed at 6pm
  // should drop off a filtered map at 6pm, not when the visitor next reloads.
  // But visiblePoints' identity is load-bearing (see mapPoints just below: a
  // new array re-fits the map's bounds), so a minute tick must not produce a
  // new array when the same places are still open.
  //
  // Hence the id string rather than a Set or an array: it's a primitive, so an
  // unchanged result is `===` to the last one and the memo below doesn't
  // recompute at all. When the chip is off this is the empty string forever
  // and the clock reaches nothing.
  const openNowIds = useMemo(
    () => openNowIdsFor(allPoints, filters, clock, hoursKeysByCat).join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey, clock, allPoints, hoursKeysByCat],
  )

  const visiblePoints = useMemo(() => {
    const openNow = new Set(openNowIds.split('|'))
    return allPoints
      // Pinned is a UNION with the category chips, not a replacement — a
      // pinned place shows up whether or not its own category chip happens
      // to be on, while an unpinned place in a selected category still
      // shows too (see the Pinned chip's own comment above).
      .filter((p) => effectiveSelected.has(p.filterId) || (pinnedSelected && p.pinned))
      .filter((p) =>
        askIds === null ? true : p.raw ? askIds.has(p.raw.id) : activeTerms.length > 0 && activeTerms.every((t) => stripApostrophes(p.searchText).includes(t)),
      )
      .filter((p) => !p.raw || passesOwnFilters(p.raw))
      .filter((p) => !p.raw || !filters[p.raw.category]?.openNow || openNow.has(p.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPoints, effectiveSelected, askIds, activeTerms, passesOwnFilters, openNowIds, pinnedSelected])
  // A plain `[...visiblePoints, ...droppedMapPoints]` spread inline in the
  // JSX below would build a fresh array on every ResourceMapView render —
  // including ones that don't touch either input, e.g. a background tap
  // that only closes the sheet. ResourceMap treats a new `points` reference
  // as new data and re-fits its bounds, so that unrelated re-render was
  // enough to visibly re-zoom the map. Memoizing keeps the reference stable
  // unless the actual point set changed.
  const mapPoints = useMemo(
    () => (ui.map.pins ? [...visiblePoints, ...droppedMapPoints] : visiblePoints),
    [visiblePoints, droppedMapPoints],
  )
  // Where the sidebar's list was scrolled to, while a place is open in it.
  const sidebarListKey = useMemo(() => visiblePoints.map((p) => p.id).join('|'), [visiblePoints])
  const keptSidebarScroll = useKeptListScroll(sidebarListKey)

  // Whether a search/filter is meaningfully "active" — used to (a) gate the
  // sheet-raise/auto-select effect below to commit points instead of every
  // keystroke, and (b) tell ResourceMap it should refit the viewport to the
  // results even when a user location is set (which normally takes priority
  // over reframing — see ResourceMap's marker-sync effect).
  const searchActive = !!committedQuery || hasFilters

  // Committing a search query or filter chip (not each keystroke —
  // committedQuery/filterChips only change at commit points, unlike
  // activeTerms/visiblePoints which also track the live-typed text) surfaces
  // the result the way Google Maps does: exactly one match opens straight to
  // its card; more than one shows the list (raising the sheet on mobile,
  // dropping any previously-selected place on desktop so the sidebar's list
  // is what's visible).
  //
  // `isMobile` is a dep too, not just read inside — useIsMobile starts false
  // on every mount (SSR-safe default, corrected a render later — see its own
  // note) and this effect otherwise only reruns when committedQuery/
  // filterChips actually change. Arriving here already carrying a filter
  // (e.g. tapping Map from an already-filtered category) commits that filter
  // on the very first render, before isMobile has corrected itself — without
  // this dep the effect ran once against the stale `isMobile === false`,
  // took the desktop branch, and never got another chance to raise the sheet.
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
      // Not mid-edit: a chip toggled beside the editor leaves it open (a
      // search asks first, and has closed it by the time it commits).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!desktopEditing) setDesktopSelected(visiblePoints.length === 1 ? visiblePoints[0] : null)
      setSidebarCollapsed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedQuery, filtersKey, isMobile])

  const {
    categoriesOpen,
    draftSelected,
    categoryResortToken,
    closeCategoriesPicker,
    allChipsOn,
    draftNoneSelected,
    draftAllOn,
    openCategoriesPicker,
    applyCategoriesPicker,
    toggle,
    showAllPlaces,
    showAll,
    togglePinnedSelected,
    toggleCategoryCheckbox,
    toggleDraftShowAll,
  } = useMapCategories({
    options,
    setSelected,
    effectiveSelected,
    pinnedSelected,
    setPinnedSelected,
    eruvimOn,
    mappablePinnedCount,
    setSidebarCollapsed,
    isMobile,
    nearbySheetRef,
  })

  // ── The Filters sheet's changes ───────────────────────────────────────────
  // Every category showing that keeps hours: the sheet's top Open now,
  // typing "open now", and the search's own "Open now" suggestion.
  function openNowEverywhere() {
    setInput('')
    setCommittedQuery('')
    updateFilters((f) => setOpenNowFor(f, categories ?? [], true))
  }
  function onSheetOpenNow(categoryId: string) {
    updateFilters((f) => toggleOpenNow(f, categoryId))
  }
  function onSheetBoolean(categoryId: string, key: string) {
    if (!filters[categoryId]?.bool?.includes(key)) track('field_filter_selected', { category: categoryId, field: key })
    updateFilters((f) => toggleBool(f, categoryId, key))
  }
  function onSheetSelect(categoryId: string, key: string, value: string) {
    if (!filters[categoryId]?.select?.[key]?.includes(value)) track('field_filter_selected', { category: categoryId, field: key, value })
    updateFilters((f) => toggleSelect(f, categoryId, key, value))
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
  const desktopNarrowed = selected !== null || committedQuery.length > 0 || hasFilters || pinnedSelected

  // Whether the sidebar is actually on screen right now — either because
  // something narrowed the map down (a search, a category, a selected
  // place) or because the visitor opened it manually via the edge toggle —
  // and it hasn't been collapsed. The toggle button always renders (see the
  // JSX below), so there's always a way to pull the panel out, even on a
  // freshly-loaded map with nothing narrowed yet.
  const sidebarVisible = (desktopNarrowed || !!desktopSelected || sidebarOpenedManually) && !sidebarCollapsed
  // Keyed off sidebarVisible itself, not off desktopNarrowed/desktopSelected
  // (which the old version branched on) — those can go stale independently
  // of sidebarCollapsed. Concretely: select a place (sidebarCollapsed reset
  // to false at selection time), close via this same toggle while still
  // selected (branches into setSidebarCollapsed, so it's now true), then
  // click the map background to deselect (desktopSelected -> null, but
  // nothing there touches sidebarCollapsed — it's still true). Toggling
  // again now falls into the OTHER branch (desktopNarrowed/desktopSelected
  // are both falsy), which only ever flipped sidebarOpenedManually — never
  // sidebarCollapsed, which was the one thing actually keeping it hidden.
  // sidebarVisible stayed false no matter how many times you clicked
  // "Show sidebar" after that. Always writing both flags to an explicit
  // target state (not toggling either blind) means there's no combination
  // of prior state this can get stuck in.
  function toggleSidebar() {
    if (sidebarVisible) {
      setSidebarCollapsed(true)
    } else {
      setSidebarCollapsed(false)
      setSidebarOpenedManually(true)
    }
  }

  // Auto-collapse the sidebar once whatever it was showing disappears —
  // e.g. unchecking the last matching filter leaves zero results. A panel
  // left open with nothing but a "no places" message isn't worth the
  // width; tucking it away automatically matches what the collapse arrow
  // already does on request. Only applies to the results-list case, not a
  // specific selected place (desktopSelected) — that one only goes away
  // when the visitor explicitly backs out of it. Not while the eruv lines
  // are on: the list has the eruvim then, places or no places (the user,
  // Oct 15: the Eruv button should bring up its list as a category does,
  // and it was folding the sidebar straight away again).
  useEffect(() => {
    if (isMobile || desktopSelected || !desktopNarrowed || eruvimOn) return
    if (visiblePoints.length === 0) setSidebarCollapsed(true)
  }, [visiblePoints.length, desktopSelected, desktopNarrowed, isMobile, setSidebarCollapsed, eruvimOn])

  // ── Desktop search box + its autocomplete dropdown — shared between the
  // two places it can render: floating directly on the map (the default
  // browsing state, Google-Maps-style) or embedded at the top of the
  // sidebar (once something's actually been searched/picked). Only one of
  // these ever actually mounts at a time (the two call sites are mutually
  // exclusive on desktopNarrowed/desktopSelected), so this still respects
  // "only one desktop <input> in the DOM at once" — see the mobile input's
  // own comment about why that matters. ─────────────────────────────────
  const desktopSearchForm = ui.search.map && !isMobile && (
    <DesktopSearchForm
      inputRef={desktopSearchInputRef}
      placeOpen={!!desktopSelected}
      onBack={() => (desktopEditing ? editor.back() : setDesktopSelected(null))}
      backLabel={desktopEditing ? editor.label : 'Back to results'}
      input={input}
      setInput={setInput}
      setSearchFocused={setSearchFocused}
      submitSearch={submitSearch}
      clearSearch={clearSearch}
      dropdownShown={dropdownShown}
      showOpenNowSuggestion={showOpenNowSuggestion}
      selectOpenNow={selectOpenNow}
      searchSuggestions={searchSuggestions}
      selectSuggestion={selectSuggestion}
      nothing={typedNothing && nothingBox(input, 'rounded-none border-0')}
    />
  )

  // A live seasonal campaign's category (see CampaignBannerManager), given
  // its own distinctly-styled chip rather than just sorting into `options`
  // by count like every other category — the whole point is that a visitor
  // notices it's not an ordinary category. Absent entirely outside the
  // campaign's date range (activeCampaignBanner), and also when its
  // category currently has no points to show (nothing to filter to).
  // Which campaign is on waits for today's date, as the home card's does.
  const campaignBanners = useCampaignBanners()
  const campaignClock = useNow()
  const activeCampaign = campaignClock === null ? null : activeCampaignBanner(campaignBanners, campaignClock, timezone)
  const campaignOption = activeCampaign ? options.find((o) => o.id === activeCampaign.categoryId) : undefined
  const campaignHighlighted = !!campaignOption && effectiveSelected.has(campaignOption.id) && !allChipsOn
  const campaignChip = campaignOption && (
    <CampaignChip campaignOption={campaignOption} campaignHighlighted={campaignHighlighted} effectiveSelected={effectiveSelected} toggle={toggle} />
  )

  // A standalone toggle, not one of CategoryFilter's own chips — it narrows
  // ACROSS categories rather than toggling one, so it doesn't belong to
  // that component's select/all/none model. Rendered by CategoryFilter
  // itself, right after the "All" chip and before the real category
  // chips — it's the most important shortlist, not just another category.
  // Hidden until there's at least one pin: an always-visible "Pinned 0"
  // that narrows the map to nothing isn't a useful default state for a
  // feature nobody's touched yet.
  // Display only, same reasoning as CategoryFilter's own chips — while
  // "All" is on, Pinned is technically part of the selection too, but
  // coloring it in adds nothing the map (showing everything already) hasn't
  // already said. The real toggle state (aria-pressed, the click handler)
  // stays keyed on `pinnedSelected` itself.
  const pinnedHighlighted = pinnedSelected && !allChipsOn
  // "Saved" (Pin until Oct 14, canvas page "you", board YouMap): right after
  // All, which includes it (the user, Oct 23) — the visitor's own places,
  // not one more category.
  const pinnedChip = ui.map.pins && mappablePinnedCount > 0 && (
    <PinnedChip pinnedHighlighted={pinnedHighlighted} pinnedSelected={pinnedSelected} togglePinnedSelected={togglePinnedSelected} mappablePinnedCount={mappablePinnedCount} />
  )

  const { eruvCategory, eruvimWithLines, mapEruvim, listedEruvim, openEruvId, openEruv, tapEruvButton, eruvDetail } = useMapEruvim({
    categories,
    countCommunity,
    eruvimOn,
    setEruvimOn,
    clock,
    selectedPointId,
    colorById,
    isMobile,
    nearbySheetRef,
    leaveEditThen,
    setDesktopSelected,
    setSidebarCollapsed,
    deselectPlace,
    standalone,
    initialPlaceId,
    effectiveSelected,
    pinnedSelected,
    setPinnedSelected,
    allChipsOn,
    setSelected,
    showAllPlaces,
  })
  // ── Filters: one button, one sheet, the chips of what's on ───────────────
  // The categories showing, in the chip row's order: the sheet's sections.
  const showingCategories = useMemo(() => {
    const byId = new Map((categories ?? []).map((c) => [c.id, c]))
    return options.flatMap((o) => (effectiveSelected.has(o.id) && byId.has(o.id) ? [byId.get(o.id)!] : []))
  }, [options, effectiveSelected, categories])
  const topOpenNow = openNowAll(filters, showingCategories)
  const categorySections = useMemo<MapFilterSection[]>(() => {
    return showingCategories.flatMap((c) => {
      const f = filters[c.id] ?? {}
      const fields = filterFields(c)
      const catPoints = allPoints.filter((p) => p.filterId === c.id)
      const booleans = fields.filter((x) => x.type === 'boolean').map((x) => ({ key: x.key, label: x.filterLabel ?? x.label, on: !!f.bool?.includes(x.key) }))
      const selects = fields
        .filter((x) => x.type === 'select')
        .map((x) => {
          const chosen = f.select?.[x.key] ?? []
          // The values its places actually have, and whatever's chosen.
          const values = [...new Set([...catPoints.flatMap((p) => (p.raw ? selectValues(p.raw[x.key]) : [])), ...chosen])].filter(Boolean)
          return { key: x.key, label: x.filterLabel ?? x.label, values, chosen }
        })
        .filter((sel) => sel.values.length > 0)
      const openNow = keepsHours(c) ? !!f.openNow : null
      if (openNow === null && booleans.length === 0 && selects.length === 0) return []
      const shown = optionsWithFilters.find((o) => o.id === c.id)?.count ?? catPoints.length
      return [
        {
          id: c.id,
          label: c.pluralLabel,
          icon: c.icon,
          color: colorById.get(c.id) ?? '#64748b',
          note: shown === catPoints.length ? `all ${catPoints.length}` : `${shown} of ${catPoints.length}`,
          openNow,
          booleans,
          selects,
        },
      ]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingCategories, filtersKey, allPoints, optionsWithFilters, colorById])
  const filterSections = categorySections
  const andNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
  const topOpenNowNote = topOpenNow.on
    ? `For ${andNames(topOpenNow.withHours.map((c) => c.pluralLabel))}.`
    : topOpenNow.onFor.length > 0
      ? `On for ${andNames(topOpenNow.onFor)} only.`
      : null
  const filtersOn = filterCount(filters, showingCategories)
  const filtersButton = <FiltersButton filtersOn={filtersOn} setFiltersOpen={setFiltersOpen} />
  const leadingChips = filtersButton
  // The Eruv button: bottom-right on the map, above the live-location
  // button on a phone and above zoom on a computer, so every chip in the row
  // is a place filter (the user, Oct 15). There once there's a line to draw.
  // Off, white with the eruv's icon in its colour; on, filled.
  const eruvColor = colorById.get(eruvCategory?.id ?? '') ?? '#64748b'
  const eruvButton = eruvimWithLines.length > 0 && <EruvButton tapEruvButton={tapEruvButton} eruvimOn={eruvimOn} eruvColor={eruvColor} eruvIcon={eruvCategory?.icon ?? ''} />

  const filtersSheet = (
    <MapFiltersSheet
      isOpen={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      top={{ shown: topOpenNow.shown, on: topOpenNow.on, note: topOpenNowNote }}
      onTopOpenNow={() => updateFilters((f) => setOpenNowFor(f, topOpenNow.withHours, !topOpenNow.on))}
      sections={filterSections}
      onOpenNow={onSheetOpenNow}
      onBoolean={onSheetBoolean}
      onSelect={onSheetSelect}
      onClearAll={() => setOwnFilters({})}
      anyOn={hasFilters}
      count={visiblePoints.length}
      doneLabel={visiblePoints.length === 0 && mapEruvim.length > 0 ? `Show ${mapEruvim.length} ${mapEruvim.length === 1 ? 'eruv' : 'eruvim'}` : undefined}
    />
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
      leadingChip={leadingChips}
      campaignChip={campaignChip}
      pinnedChip={pinnedChip}
      scrollArrow
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
      className={mapShellClass(fullscreen)}
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
            // desktop:absolute (not a flex sibling that consumes row width
            // anymore): this used to sit inline in the flex row, so opening
            // it shrank the map div next to it — which resizes the map's
            // real container, and ResourceMap's own ResizeObserver reacts to
            // any container resize by re-centering the map on its (now
            // off-center) geo center to refresh the tile layer (see that
            // comment). The net effect was the whole map visibly shifting
            // whenever the sidebar opened or closed, not just around a
            // selection — Google Maps' own results panel floats over the
            // map instead for exactly this reason. Overlaying it here (with
            // its own elevation) means the map's box never changes size, so
            // that ResizeObserver never fires and nothing under it moves.
            <DesktopSidebar sidebarVisible={sidebarVisible} sidebarWidth={sidebarWidth} isDraggingSidebar={isDraggingSidebar}>
              {ui.map.nearbyList &&
                // No "Back to list" in here: the ← in the search box above
                // is the way back on a computer (Oct 15).
                (desktopSelected?.filterId === ERUV_FILTER_ID && eruvDetail(desktopSelected.id.slice(ERUV_PREFIX.length)) ? (
                  <SidebarScroll key={desktopSelected.id}>{eruvDetail(desktopSelected.id.slice(ERUV_PREFIX.length), undefined, onPlaceEditor)}</SidebarScroll>
                ) : desktopSelected && desktopSelected.raw && desktopSelectedCategory ? (
                  <SidebarScroll key={`place:${desktopSelected.id}`}>
                    <MapPlaceDetail
                      item={desktopSelected.raw}
                      category={desktopSelectedCategory}
                      color={desktopSelected.color}
                      found={foundOnPoint(desktopSelected.raw.id)}
                      onEditor={onPlaceEditor}
                    />
                  </SidebarScroll>
                ) : (
                  <SidebarScroll key="list" kept={keptSidebarScroll}>
                    {activeLocation && visiblePoints.length > 0 && (
                      <p className="mb-2 px-1 text-xs text-slate-400">
                        Sorted by distance from your location{tracking ? ', updating live as you move.' : '.'}
                      </p>
                    )}
                    <NearbyList
                      points={visiblePoints}
                      userLocation={activeLocation}
                      onViewListing={onViewListing}
                      onSelectPlace={selectPlace}
                      eruvim={listedEruvim}
                      onSelectEruv={openEruv}
                      onHover={hover.set}
                      empty={searchedNothing ? nothingBox(committedQuery) : undefined}
                    />
                  </SidebarScroll>
                ))}
            </DesktopSidebar>
          )}

          {!isMobile && (
            <DesktopMapChrome
              sidebarVisible={sidebarVisible}
              sidebarWidth={sidebarWidth}
              isDraggingSidebar={isDraggingSidebar}
              onSidebarHandlePointerDown={onSidebarHandlePointerDown}
              onSidebarHandlePointerMove={onSidebarHandlePointerMove}
              onSidebarHandlePointerUp={onSidebarHandlePointerUp}
              onSidebarHandlePointerCancel={onSidebarHandlePointerCancel}
              onSidebarHandleKeyDown={onSidebarHandleKeyDown}
              toggleSidebar={toggleSidebar}
              searchForm={desktopSearchForm}
              categoryChips={desktopCategoryChips}
              fullscreen={fullscreen}
              setFullscreen={setFullscreen}
              exitFullscreen={exitFullscreen}
              standalone={standalone}
              controls={controls}
            />
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
            className="relative left-1/2 flex min-h-[320px] w-page flex-1 -translate-x-1/2 flex-col overflow-hidden desktop:left-0 desktop:min-h-0 desktop:w-auto desktop:translate-x-0"
          >
              <MapWithHover
                highlight={hover}
                points={mapPoints}
                userLocation={activeLocation}
                directionsOrigin={directionsOrigin}
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
                  // A pin tapped directly on the map is already visible right
                  // where it is — reframing to fit it alongside the visitor's
                  // location (like a list pick does) would yank the view the
                  // visitor just tapped into, which reads as disorienting.
                  selectPlace(sp, false)
                }}
                onDeselectPoint={deselectPlace}
                // Tapping empty map while a place's card is showing counts as
                // unselecting it, same as tapping its pin again would — the
                // card goes away AND the pin stops reading as selected
                // (collapse clears `selected`, not just the sheet's height).
                onBackgroundClick={() => (isMobile ? nearbySheetRef.current?.collapse() : leaveEditThen(() => setDesktopSelected(null)))}
                onMapLongPress={ui.map.pins ? (coords) => setPendingDropAt(coords) : undefined}
                onLongPressPoint={ui.map.pins ? handleLongPressPoint : undefined}
                searchActive={searchActive}
                selectedId={selectedPointId}
                frameToken={frameToken}
                obscuredBottomPx={isMobile ? sheetHeightPx : 0}
                obscuredTopPx={isMobile ? topOverlayHeight : 0}
                zoomRadiusMiles={mapZoomRadiusMiles}
                eruvim={mapEruvim}
                onSelectEruv={openEruv}
                selectedEruvId={openEruvId}
                frameEruvim={mapEruvim.length > 0 && visiblePoints.length === 0}
                cornerControl={isMobile ? undefined : eruvButton}
              />

              {ui.map.liveTracking && <DesktopTrackingButton tracking={tracking} onClick={() => (tracking ? stop() : handleStart())} />}
              {/* ── Floating search + filters (mobile) — laid directly over the
                      map, Google-Maps-style, instead of pushing it down. Category
                      chips sit right under the search bar as their own
                      always-visible scroll row, same as Google Maps — no
                      separate "Filters" button/sheet. ───────────────────────── */}
              {ui.search.map && isMobile && (
                <MobileMapSearch
                  overlayRef={setTopOverlayEl}
                  backTo={backTo}
                  inputRef={mobileSearchInputRef}
                  input={input}
                  setInput={setInput}
                  setSearchFocused={setSearchFocused}
                  submitSearch={submitSearch}
                  clearSearch={clearSearch}
                  nearbySheetRef={nearbySheetRef}
                  locationButtonRef={locationButtonRef}
                  activeLocation={activeLocation}
                  tracking={tracking}
                  hasOptions={options.length > 0}
                  dropdownShown={dropdownShown}
                  chips={
                    <CategoryFilter
                      options={optionsWithFilters}
                      selected={effectiveSelected}
                      onToggle={toggle}
                      onAll={showAll}
                      maxVisible={4}
                      resortToken={categoryResortToken}
                      onMore={openCategoriesPicker}
                      leadingChip={leadingChips}
                      campaignChip={campaignChip}
                      pinnedChip={pinnedChip}
                    />
                  }
                  suggestions={
                    <SearchSuggestions
                      className="mt-2 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5"
                      rowPadding="px-4"
                      openNow={showOpenNowSuggestion}
                      onOpenNow={selectOpenNow}
                      places={searchSuggestions}
                      onPick={selectSuggestion}
                      nothing={typedNothing && nothingBox(input, 'rounded-none border-0')}
                    />
                  }
                />
              )}

              {ui.map.liveTracking && <MobileRecenterButton activeLocation={activeLocation} follow={follow} setFollow={setFollow} locationButtonRef={locationButtonRef} />}
              {isMobile && eruvButton && (
                // Above the live-location button, where it's there.
                <div className={`absolute right-3 z-10 desktop:hidden ${ui.map.liveTracking ? 'bottom-[8.5rem]' : 'bottom-[4.75rem]'}`}>{eruvButton}</div>
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
                  foundOn={foundOnPoint}
                  containerHeight={mapBoxHeight}
                  onSelectionChange={(point, frame) => {
                    setSelectedPointId(point?.id)
                    if (point && frame !== false) setFrameToken((t) => t + 1)
                  }}
                  onHeightChange={setSheetHeightPx}
                  renderOther={(p, back) => (p.filterId === ERUV_FILTER_ID ? eruvDetail(p.id.slice(ERUV_PREFIX.length), back) : null)}
                  eruvim={listedEruvim}
                  onSelectEruv={openEruv}
                  empty={searchedNothing ? nothingBox(committedQuery) : undefined}
                />
              )}
          </div>
        </>
      )}

      {/* ── "No results" fallback — only needed when the results list itself
              is turned off (ui.map.nearbyList), since NearbyList otherwise
              already shows this same message inline (mobile sheet / desktop
              sidebar). ───────────────────────────────────────────────────── */}
      {!loading && !ui.map.nearbyList && visiblePoints.length === 0 && mapEruvim.length === 0 && searchedNothing && nothingBox(committedQuery, 'mt-3')}
      {!loading && !ui.map.nearbyList && visiblePoints.length === 0 && mapEruvim.length === 0 && !searchedNothing && (
        <p className="mt-3 text-center text-sm text-slate-500">
          {activeTerms.length > 0 || hasFilters
            ? 'No places match every filter. Try removing one.'
            : 'No places shown. Turn on a category above to see locations.'}
        </p>
      )}

      {filtersSheet}

      {categoriesOpen && (
        <CategoriesPickerScreen
          closeCategoriesPicker={closeCategoriesPicker}
          toggleDraftShowAll={toggleDraftShowAll}
          draftAllOn={draftAllOn}
          draftNoneSelected={draftNoneSelected}
          applyCategoriesPicker={applyCategoriesPicker}
          optionsWithFilters={optionsWithFilters}
          draftSelected={draftSelected}
          toggleCategoryCheckbox={toggleCategoryCheckbox}
        />
      )}

      <DroppedPinEditors
        pendingDropAt={pendingDropAt}
        setPendingDropAt={setPendingDropAt}
        editingDroppedId={editingDroppedId}
        setEditingDroppedId={setEditingDroppedId}
        droppedPins={droppedPins}
        addDroppedPin={addDroppedPin}
        renameDroppedPin={renameDroppedPin}
        removeDroppedPin={removeDroppedPin}
      />
    </div>
  )
}
