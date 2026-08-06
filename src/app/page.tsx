'use client'

import { useState, useEffect } from 'react'
import type { AppMode, DirectoryAnchor, MapFilters, NavigateFn } from '@/types'
import Landing from '@/components/Landing'
import AllCategories from '@/components/AllCategories'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import FindResources from '@/components/FindResources'
import ResourceMapView from '@/components/map/ResourceMapView'
import SupportWizard from '@/components/wizard/SupportWizard'
import VolunteerWizard from '@/components/wizard/VolunteerWizard'
import GenericFormWizard from '@/components/wizard/GenericFormWizard'
import MobileTabBar from '@/components/MobileTabBar'
import FeedbackForm from '@/components/FeedbackForm'
import LiveLocationPrompt from '@/components/LiveLocationPrompt'
import { useLiveLocation } from '@/lib/useLiveLocation'
import { useCategories } from '@/lib/useCategories'
import { useIsMobile } from '@/lib/useIsMobile'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { DEFAULT_MOBILE_TABS, type MobileTabConfig } from '@/lib/siteSettings'
import { ui } from '@/lib/uiConfig'

// Which guided form is open as a full-screen overlay, and any need
// pre-checked from the card or a search result. `kind` is 'support'/
// 'volunteer' for the two built-in forms, or any other form's id for an
// admin-created custom form (see GenericFormWizard.tsx).
export type Flow = { kind: string; preselect?: string[] }

// What we persist in the browser history stack so back/forward can restore state.
// `flowStep` is the wizard's current step index — each step is its own history
// entry, so browser Back/forward (and the swipe gesture) move between steps
// instead of discarding the whole form. The Wizard maintains it; page.tsx only
// reads it (to know how far to unwind on a full close).
type NavState = {
  mode: AppMode
  flow?: Flow
  flowStep?: number
  mapCategory?: string
  mapQuery?: string
  /** The exact set of category chips toggled on the map, kept in sync with the
   *  live map state (see ResourceMapView) so browser back restores what was
   *  actually on screen instead of the snapshot from when the map first opened. */
  mapSelected?: string[]
  /** Field filters (open-now / kosher / type) carried from the directory, kept
   *  in sync with the live map state. */
  mapFilters?: MapFilters
  /** True when this map entry came from a category directory's own "Map"
   *  button rather than the general Map tab — see mapEnteredFromListing. */
  mapFromListing?: boolean
  /** Which section the All Categories page should scroll to on arrival (set
   *  when the visitor clicked a section tab rather than "Browse all"). */
  allCategoriesSection?: string
  /** Which category directory is open. Owned by FindResources (which reads and
   *  writes it for its own sub-views); page.tsx only mirrors it, to highlight a
   *  matching mobile tab. */
  findView?: string
}

export default function Page() {
  const [mode, setMode] = useState<AppMode>('home')
  // Location persists across reloads/return visits — it drives all distance
  // sorting. `tracking`/`start`/`stop` are the site-wide live GPS watch (see
  // useLiveLocation): once started, coords/address update continuously as the
  // visitor moves, everywhere — not just on the map screen.
  const { address, coords, setAddress, setCoords, tracking, geoError, start: startLiveTracking, stop: stopLiveTracking } = useLiveLocation()
  const categories = useCategories()
  const settings = useSiteSettings()
  // Mobile's Feedback tab is a real full-page screen (mode 'feedback'); on
  // desktop there's no such tab, so the same mode instead means "show the
  // footer's own feedback modal on top of home" — same idea as the map's
  // standalone-fullscreen fix: however mode became 'feedback' (a real mobile
  // tab tap, or a resize back up to desktop after one, or history restore),
  // landing on it at desktop width means the modal, not a bare inline page.
  // Derived, not its own state — closing it is just goToHome(), which this
  // recomputes to false on its own; nothing to desync.
  const isMobile = useIsMobile()
  const feedbackModalOpen = mode === 'feedback' && !isMobile
  const [flow, setFlow] = useState<Flow | null>(null)
  // Which category directory is open, mirrored from history state purely so the
  // mobile tab bar can light up a card tab pointing at it. FindResources owns
  // the real `view` — this is a read-only shadow of the same history field, kept
  // in sync at every transition that can change which *category* is open (they
  // all go through navigate/viewListing or a popstate). Its own internal moves
  // — opening a listing's edit form, a hospital's About page — don't change the
  // category, so not seeing those is fine.
  const [findView, setFindView] = useState<string | null>(null)
  // Which category to pre-select when opening the map from a category directory.
  const [mapCategory, setMapCategory] = useState<string | null>(null)
  // When arriving from a directory with an active search, pre-fill the map's
  // own search box with the same query.
  const [mapQuery, setMapQuery] = useState<string | null>(null)
  // The exact set of category chips toggled on the map — see NavState.mapSelected.
  const [mapSelectedCategories, setMapSelectedCategories] = useState<string[] | null>(null)
  // Field filters carried from a directory onto the map — see NavState.mapFilters.
  const [mapFilters, setMapFilters] = useState<MapFilters | null>(null)
  // Whether the current map entry came from a category directory's own "Map"
  // button (vs. the general Map tab) — on desktop this both starts
  // ResourceMapView already fullscreen and makes its fullscreen-exit control
  // navigate straight back to that directory instead of collapsing to a
  // boxed map screen (see ResourceMapView's onExitFullscreenToListing).
  const [mapEnteredFromListing, setMapEnteredFromListing] = useState(false)
  // Which section the All Categories page should scroll to — see
  // NavState.allCategoriesSection.
  const [allCategoriesSection, setAllCategoriesSection] = useState<string | null>(null)
  // Whether ResourceMapView has ever been mounted — once true it stays mounted
  // forever (see the render below), so switching tabs away and back hides it
  // via CSS instead of unmounting/remounting, preserving pan/zoom, the
  // selected pin, search, and filters across the round trip. Starts false so
  // the Google Maps script/tiles don't load until the visitor actually opens
  // the Map tab at least once.
  const [mapMounted, setMapMounted] = useState(false)
  useEffect(() => {
    if (mode === 'map') setMapMounted(true)
  }, [mode])
  // Bumped only by viewMapForCategory (a deliberate "show me this category on
  // the map" jump, e.g. from a directory's "View map" button) — remounting
  // ResourceMapView fresh so its initial* props actually take effect even
  // though it otherwise stays mounted across ordinary tab switches.
  const [mapResetToken, setMapResetToken] = useState(0)

  // The address anchor, editable from the header's location pill on every screen
  // — it drives all proximity sorting in the directory. Also carries the
  // site-wide live-tracking controls so the pill can start/stop the same GPS
  // watch the map page uses, rather than a separate one-shot fix.
  const locationControls = {
    address,
    onAddressChange: setAddress,
    onCoords: setCoords,
    tracking,
    geoError,
    onStartTracking: startLiveTracking,
    onStopTracking: stopLiveTracking,
  }

  // ── History API — keeps browser back/forward in sync with React state ──────
  useEffect(() => {
    // Do NOT call replaceState here. Next.js App Router stamps the initial entry
    // with __NA:true; overwriting it before that stamp lands strips __NA and causes
    // its popstate handler to call window.location.reload() on every history.back().
    function onPopState(e: PopStateEvent) {
      const s = e.state as NavState | null
      setMode(s?.mode ?? 'home')
      setFlow(s?.flow ?? null)
      setMapCategory(s?.mapCategory ?? null)
      setMapQuery(s?.mapQuery ?? null)
      setMapSelectedCategories(s?.mapSelected ?? null)
      setMapFilters(s?.mapFilters ?? null)
      setMapEnteredFromListing(!!s?.mapFromListing)
      setAllCategoriesSection(s?.allCategoriesSection ?? null)
      setFindView(s?.findView ?? null)
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // On a full page reload the browser keeps the current entry's history.state, so
  // restore whatever screen the visitor was on (a category, the hospitals list,
  // an open form) instead of snapping back to the landing page. Runs once after
  // mount — initializing state from history.state directly would mismatch the
  // server-rendered (always-home) markup during hydration.
  useEffect(() => {
    const s = window.history.state as NavState | null
    if (s?.mode && s.mode !== 'home') setMode(s.mode)
    if (s?.flow) setFlow(s.flow)
    if (s?.mapCategory) setMapCategory(s.mapCategory)
    if (s?.mapQuery) setMapQuery(s.mapQuery)
    if (s?.mapSelected) setMapSelectedCategories(s.mapSelected)
    if (s?.mapFilters) setMapFilters(s.mapFilters)
    if (s?.mapFromListing) setMapEnteredFromListing(true)
    if (s?.allCategoriesSection) setAllCategoriesSection(s.allCategoriesSection)
    if (s?.findView) setFindView(s.findView)
  }, [])

  // Central navigation function — always call this instead of setMode directly so
  // every transition is recorded in the browser history stack. The first arg is
  // the legacy audience key (unused now that there's a single path) — kept so the
  // shared NavigateFn signature and search-index destinations keep compiling.
  const navigate: NavigateFn = (_audience, nextMode, extra) => {
    setMode(nextMode)
    setFlow(null)
    setFindView(typeof extra?.findView === 'string' ? extra.findView : null)
    history.pushState({ mode: nextMode, ...extra } as NavState, '')
  }

  // Open a guided form over the current page. Pushes the base flow entry
  // (flowStep 0); the Wizard pushes one more entry per step it advances, so the
  // browser Back button walks back through the steps and only closes the form
  // once the visitor backs out of step 0.
  function openFlow(kind: Flow['kind'], preselect?: string[]) {
    const f: Flow = { kind, preselect }
    setFlow(f)
    history.pushState({ ...(window.history.state ?? {}), flow: f, flowStep: 0 }, '')
  }

  // Fully close the wizard from any step (its ✕ / Esc / success "Done"). Each
  // step is a history entry, so we pop the current step plus every entry down to
  // and including the base flow entry — landing exactly on the page the visitor
  // opened the form from, where popstate sees no `flow` and unmounts the overlay.
  function closeFlow() {
    const step = (window.history.state as NavState | null)?.flowStep ?? 0
    history.go(-(step + 1))
  }

  // Title click — always a way back to the landing page.
  function goToLanding() {
    navigate(null, 'home')
  }

  // Mobile tab bar — Categories/Find both read as the "Categories" tab (see
  // MobileTabBar's BUILT_IN_MODES), and re-tapping it always resets to the root
  // Landing grid rather than staying wherever the visitor drilled into.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const selectTab = (tab: MobileTabConfig) => {
    if (tab.target === 'categories') navigate(null, 'home')
    else if (tab.target === 'map') {
      // A plain tab switch, not a listing's "Map" button — the map should
      // show its normal (possibly boxed, on desktop) state, not re-enter
      // fullscreen or wire its exit control back to a stale listing.
      setMapEnteredFromListing(false)
      navigate(null, 'map')
    } else if (tab.target === 'feedback') navigate(null, 'feedback')
    // Anything else is a card id. A category opens its directory; everything
    // else is a form (the built-in support/volunteer, or an admin-made one)
    // and opens as a full-screen wizard, exactly as its home-screen tile does.
    else if (categories?.some((c) => c.id === tab.target)) {
      navigate(null, 'find', { findView: tab.target })
    } else openFlow(tab.target)
  }

  // The two built-in gates that have always applied. Card tabs are left alone:
  // a target is either a category or a form, and telling a deleted category
  // apart from a perfectly valid form id would mean fetching the forms list on
  // every page load to guard against something the admin editor already
  // prevents — and getting it wrong would silently hide a working tab.
  // `?? DEFAULT_MOBILE_TABS` guards a response from a deployment older than the
  // mobileTabs field (or a stale cached one): the bar is on every mobile screen,
  // so an undefined here would be a crash on load rather than a missing tab.
  const visibleTabs = (settings.mobileTabs ?? DEFAULT_MOBILE_TABS).filter((t) =>
    t.target === 'map' ? hasMap : t.target === 'feedback' ? settings.feedbackEnabled : true,
  )

  const tabBar = (
    <MobileTabBar
      mode={mode}
      tabs={visibleTabs}
      onSelect={selectTab}
      activeCardId={findView}
      iconForTarget={(target) => categories?.find((c) => c.id === target)?.icon ?? undefined}
    />
  )

  const overlay = flow && (
    flow.kind === 'support' ? (
      <SupportWizard preselect={flow.preselect} onClose={closeFlow} />
    ) : flow.kind === 'volunteer' ? (
      <VolunteerWizard preselect={flow.preselect} onClose={closeFlow} />
    ) : (
      <GenericFormWizard formId={flow.kind} onClose={closeFlow} />
    )
  )

  // Everything anchors on the visitor's typed address now (the hospital picker
  // was retired from the location pill).
  const anchor: DirectoryAnchor = { coords, label: address }

  // Up buttons lead back to the single home screen.
  const goToHome = () => navigate(null, 'home')

  // Desktop's "Browse all categories" button and its section tabs — the tabs
  // pass the section they want scrolled into view, the button passes nothing
  // and lands at the top.
  const viewAllCategories = (section?: string) => {
    setMode('all-categories')
    setAllCategoriesSection(section ?? null)
    setFlow(null)
    history.pushState({ mode: 'all-categories', allCategoriesSection: section } as NavState, '')
  }

  // Called from the Nearby list — switches to the Find screen with the chosen
  // listing's category open and that card expanded/scrolled into view.
  const viewListing = (categoryId: string, listingId: string) => {
    setMode('find')
    setMapCategory(null)
    setMapQuery(null)
    setMapSelectedCategories(null)
    setMapFilters(null)
    setFlow(null)
    setFindView(categoryId)
    history.pushState({ mode: 'find', findView: categoryId, findItemId: listingId }, '')
  }

  // Called from a category directory's "View map" button — navigates to the map
  // screen with that category pre-selected in the filter. Carries the directory's
  // active search query and field filters so the map shows the same results.
  // Starts fresh (no persisted mapSelected) — the map's own effect will sync the
  // live selection into this entry once it mounts. Bumps mapResetToken so
  // ResourceMapView remounts fresh even if it was already mounted from an
  // earlier visit — a deliberate "show me this category" jump should always
  // take effect, unlike an ordinary tab switch back to the map.
  const viewMapForCategory = (categoryId: string, query?: string, filters?: MapFilters) => {
    setMode('map')
    setMapCategory(categoryId)
    setMapQuery(query ?? null)
    setMapSelectedCategories(null)
    setMapFilters(filters ?? null)
    setMapEnteredFromListing(true)
    setFlow(null)
    setMapResetToken((t) => t + 1)
    history.pushState({ mode: 'map', mapCategory: categoryId, mapQuery: query, mapFilters: filters, mapFromListing: true } as NavState, '')
  }

  // Desktop's map-fullscreen exit control, when the map was entered via a
  // listing's own "Map" button (see mapEnteredFromListing) — takes the
  // visitor straight back to that category's directory instead of leaving a
  // boxed, non-fullscreen map behind (there's no such intermediate screen for
  // this entry point).
  const exitMapToListing = () => {
    const categoryId = mapCategory
    setMode('find')
    setMapCategory(null)
    setMapQuery(null)
    setMapSelectedCategories(null)
    setMapFilters(null)
    setMapEnteredFromListing(false)
    setFlow(null)
    setFindView(categoryId)
    history.pushState({ mode: 'find', findView: categoryId ?? undefined }, '')
  }

  return (
    <>
      <SiteHeader onGoHome={goToLanding} location={locationControls} />

      {/* ── Landing — the single home screen (search + one card grid). Also
              the backdrop for the desktop feedback-modal recovery above. ── */}
      {(mode === 'home' || mode === 'community-home' || feedbackModalOpen) && (
        <div className="flex-1">
          <Landing
            onNavigate={navigate}
            onOpenFlow={openFlow}
            onViewAllCategories={viewAllCategories}
            coords={coords}
            liveTracking={{ tracking, error: geoError, start: startLiveTracking, stop: stopLiveTracking }}
          />
        </div>
      )}

      {/* ── Find/Feedback — ordinary mount-on-demand screens. Feedback only
              renders here as its own full page on mobile — see
              feedbackModalOpen above for its desktop counterpart. ────────── */}
      {(mode === 'find' || (mode === 'feedback' && isMobile)) && (
        <main className="flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 pt-8 pb-24 sm:pt-8 sm:pb-8">
          {mode === 'find' && (
            <FindResources anchor={anchor} onUp={goToHome} onViewAllCategories={() => viewAllCategories()} onViewMap={viewMapForCategory} />
          )}
          {mode === 'feedback' && (
            <FeedbackForm variant="inline" heading={settings.feedbackHeading} successMessage={settings.feedbackSuccessMessage} />
          )}
        </main>
      )}

      {feedbackModalOpen && (
        <FeedbackForm heading={settings.feedbackHeading} successMessage={settings.feedbackSuccessMessage} onClose={goToHome} />
      )}

      {/* ── All categories — the full card index, moved off the desktop home
              screen so that screen can stay short. Desktop-only in practice
              (mobile's home screen still renders this same grid inline), but
              not gated here: a phone that lands on this history entry should
              still get a working page rather than a blank one. ───────────── */}
      {mode === 'all-categories' && (
        <div className="flex-1 pt-8">
          <AllCategories
            onNavigate={navigate}
            onOpenFlow={openFlow}
            onUp={goToHome}
            scrollToSection={allCategoriesSection}
          />
        </div>
      )}

      {/* ── Map — mounted once (on first visit) and never unmounted again;
              switching tabs away just hides it (style, not the `hidden` class,
              since that can lose a specificity fight with the `flex` classes
              also present) so the Google Map instance, its pan/zoom, the
              selected pin, search box, and category filters all survive a
              round trip through another tab instead of resetting every time.
              flex + flex-col: makes main a flex container in its own right
              (not just a flex item of body), so a flex-1 child — the mobile
              full-bleed map — can grow to fill it via flex-grow. Top/bottom
              padding: every other mobile screen scrolls, so pt-8/pb-24 give it
              breathing room and generous clearance above the tab bar. The map
              screen doesn't scroll — it's sized to fill exactly what's left —
              and wants to run flush against the header and tab bar, Google-
              Maps-style, so it drops both paddings on mobile (search/filters
              float on the map itself instead of sitting in that top gap). ── */}
      {hasMap && mapMounted && (
        <main
          className={`flex flex-1 flex-col w-full max-w-4xl mx-auto px-4 sm:pt-8 sm:pb-8 ${
            mode === 'map' ? 'pt-0 pb-[calc(3.75rem+env(safe-area-inset-bottom))]' : 'pt-8 pb-24'
          }`}
          style={mode === 'map' ? undefined : { display: 'none' }}
        >
          <ResourceMapView
            key={mapResetToken}
            onUp={goToHome}
            userLocation={coords}
            initialCategory={mapCategory || undefined}
            initialQuery={mapQuery || undefined}
            initialSelectedCategories={mapSelectedCategories || undefined}
            initialFilters={mapFilters || undefined}
            onViewListing={viewListing}
            standalone
            visible={mode === 'map'}
            // Always provided (never undefined) — this is the one page-level
            // map screen, so its fullscreen exit always has somewhere to go:
            // back to the listing it was opened from, or home otherwise.
            // However the visitor actually got here (a listing's own "Map"
            // button, the mobile tab bar, browser back/forward into a 'map'
            // history entry), landing on this screen means fullscreen.
            onExitFullscreenToListing={mapEnteredFromListing ? exitMapToListing : goToHome}
            liveTracking={{ tracking, error: geoError, start: startLiveTracking, stop: stopLiveTracking }}
          />
        </main>
      )}

      <div className="hidden sm:block">
        <SiteFooter />
      </div>
      {tabBar}
      {overlay}
      <LiveLocationPrompt enabled={ui.map.liveTracking && !tracking} onShare={startLiveTracking} />
    </>
  )
}
