'use client'

import { useEffect, useMemo, useRef, useState, ViewTransition } from 'react'
import { track } from '@vercel/analytics'
import { CardGrid, CompactCardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import SearchSection from '@/components/home/SearchSection'
import HomeMap from '@/components/home/HomeMap'
import type { LocationControls } from '@/components/home/LocationControl'
import DaveningTimesCard from '@/components/home/DaveningTimesCard'
import UpdateListingsCard from '@/components/home/UpdateListingsCard'
import ShabbatTimesCard from '@/components/home/ShabbatTimesCard'
import SubscribeSection from '@/components/home/SubscribeSection'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { BUILT_IN_BLOCKS, type HomeBlockKind } from '@/lib/homeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useNavTransitionProps } from '@/lib/navTransitions'
import { consumeHomeReveal } from '@/lib/homeRevealSignal'
import { useInView } from '@/lib/useInView'
import { useLocation } from '@/lib/locationContext'
import { community } from '@/community.config'
import { useCommunitySlug } from '@/lib/communityContext'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/types'
import { useSiteSettings } from '@/lib/useSiteSettings'
import { ui } from '@/lib/uiConfig'

export type LandingProps = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  /** The visitor's location (from the header pill) — lets "Places" results show
   *  distance, exactly like the category directory does. */
  coords: { lat: number; lng: number } | null
  /** The site-wide live GPS watch (see useLiveLocation) — passed through to the
   *  embedded home-screen map so its tracking controls act on the same shared
   *  watch as the full map page and the header pill. */
  liveTracking: { tracking: boolean; error: string | null; start: () => void; stop: () => void }
  /** Same controls object the header pill uses — passed through to the
   *  embedded map so it can surface its own copy while fullscreen covers the
   *  header (see ResourceMapView's `controls` prop). */
  controls: LocationControls
  /** 'map' when the visitor arrived by collapsing the fullscreen map — scrolls
   *  the embedded map band into view so the collapse reads as zooming out of
   *  the map rather than being dropped at the top of an unrelated page.
   *  Desktop only in practice; mobile's home screen has no map band. */
  scrollTo?: 'map' | null
}

// ── The home screen ───────────────────────────────────────────────────────────
// Desktop and mobile deliberately differ here (see the desktop-redesign notes):
//
//   Desktop — a two-column warm hero (headline + subhead + search beside a
//   photo, see HeroHeading) → six independent, admin-orderable cards (see
//   builtInOrder): Categories & Search (a flat "Browse everything" grid,
//   full weight — every card, always visible, no hover needed), Davening
//   Times, Update Listings ("kept by the community"), Explore the Map,
//   Email Signup (Stay in the Loop), and Jewish Times (Shabbat & Holiday
//   Times) — → footer. HeaderNav's "Categories" mega-menu (in SiteHeader, on
//   every screen — this page no longer owns any category nav of its own) is
//   a second way to reach a category, on top of the flat grid.
//
//   Mobile — unchanged: hero + search, then the full grouped card grid inline,
//   no map (it has its own tab for that).
//
// Typing filters the grid live against each card's hidden keywords (so "shul"
// surfaces Synagogues). On desktop, where the grid isn't on screen, typing
// reveals it inline as a results list — a search that appeared to do nothing
// would be worse than a slightly longer page.
export default function Landing({ onNavigate, onOpenFlow, coords, liveTracking, controls, scrollTo }: LandingProps) {
  const communitySlug = useCommunitySlug()
  const categories = useCategories()
  const homeSections = useHomeSections()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  // Deferred, not just observed: the embedded map costs a few hundred KB of
  // Google Maps JS (places/main/util/common/controls/map — see
  // loadGoogleMaps.ts), loaded the instant HomeMap mounts. Gating the mount
  // itself on visibility, not just position, means a mobile visitor — where
  // this whole band is `hidden` via CSS below (mobile reaches the map
  // through its own tab instead) — never triggers that download at all: a
  // `display:none` element never intersects, so mapInView never flips for
  // it. Desktop still gets the map, just once the band is actually about to
  // be seen instead of on every home-screen load regardless of scroll
  // position.
  const [mapBandRef, mapInView] = useInView<HTMLDivElement>()
  const settings = useSiteSettings()
  const entryCards = useEntryCards(onOpenFlow)
  const isMobile = useIsMobile()
  const navTransition = useNavTransitionProps()
  const { anchor } = useLocation()
  // The Map pseudo-category still gates whether the map shows at all.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')
  // Same as the real Zmanim & Shabbos category page (FindResources' own
  // locationLabel) — the visitor's typed address, or the community's region,
  // never the site's own name.
  const zmanimLocationLabel = anchor.label || community.region

  // How many listings sit behind each category, for the browse index's count
  // line. Derived from the listing set this component already holds for its
  // own search rather than a second request — and `useMemo`'d because
  // `listings` is the whole community (several hundred rows) and this runs on
  // every keystroke in the search box otherwise.
  const listingCounts = useMemo(() => {
    if (!listings) return null
    const counts: Record<string, number> = {}
    for (const l of listings) counts[l.category] = (counts[l.category] ?? 0) + 1
    return counts
  }, [listings])

  // The map card's own "N places across M categories" line — a real fact
  // standing in for a header that otherwise has nothing to say beside the
  // literal word "Map". Only `kind === 'listing'` categories count toward
  // either number: Map, Zmanim, and Eruv are pseudo-categories with no
  // listings of their own to add up.
  const listingCategories = categories?.filter((c) => c.kind === 'listing') ?? []
  const totalListings = listingCounts
    ? listingCategories.reduce((sum, c) => sum + (listingCounts[c.id] ?? 0), 0)
    : null

  const resources = resourceCards(onNavigate, categories, communitySlug, listingCounts)
  // Order is no longer alphabetical — groupCardsIntoSections (below) sorts these
  // into the admin-configured labeled groups for the grid.
  const allCards = resources ? [...entryCards, ...resources] : null

  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards

  // Individual places that match the query by name + tags (e.g. a grocery store
  // with a "cheese" tag for "kosher cheese"). Only computed once the visitor types.
  const placeHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []

  // Tapping a place opens its category directory, pre-filtered to the matched term
  // (so it survives that page's own search) with the place itself expanded.
  // Edit/Report additionally carry `findAction` so the directory opens straight
  // into that form instead of just the expanded card.
  const openPlace = (hit: (typeof placeHits)[number], action?: 'edit' | 'report') => {
    if (!action) track('listing_opened', { listing: hit.item.name, category: hit.item.category, source: 'search' })
    onNavigate('patient', 'find', {
      findView: hit.item.category,
      findQuery: hit.term,
      findItemId: hit.item.id,
      ...(action ? { findAction: action } : {}),
    })
  }

  // Capture searches that come up empty — the most actionable signal for what
  // content to add next. Only counts once data has loaded, so a slow load never
  // looks like a "miss".
  useLogSearchMiss({
    query,
    hasResults: (filtered?.length ?? 0) > 0 || placeHits.length > 0,
    ready: allCards !== null && listings !== null,
    source: 'Home',
  })

  // Sections only exist once loading is done and there's something to group;
  // while loading, a single flat grid of entry cards + skeletons stands in.
  const sections = filtered ? groupCardsIntoSections(filtered, homeSections ?? []) : []

  // The desktop gateway's own block order (admin-editable — see
  // HomeSectionManager/DesktopTopicsManager's Home screen cards list).
  // Category sections don't interleave here — the flat "Browse everything"
  // grid below shows every category on its own, ordered by this same
  // `homeSections` list; this is just "which of the six singleton cards
  // show, in what order".
  //
  // All-or-nothing: the admin's Home screen cards list is the authoritative
  // answer to what's on the page — the moment ANY row exists, this trusts
  // that as the complete configured state, not "plus whatever else might be
  // missing". An earlier version of this tried to independently default-fill
  // any kind with no row of its own, reasoning that a community which had
  // only ever configured 'browse'/'map' (true of this project's own dev
  // database at the time) shouldn't lose the other four cards the moment
  // they shipped as new kinds. That backfired in practice: it meant the
  // admin's own list — showing just the cards it actually has rows for —
  // stopped matching what the live site rendered at all, which is a worse
  // failure than a temporary gap. Removing (or simply never adding) a card
  // in the admin's list now reliably keeps it off the live site; a
  // community with zero rows at all still gets the full default set, so a
  // fresh community never launches blank.
  const configuredBuiltIns = (homeSections ?? [])
    .filter((s): s is typeof s & { kind: Exclude<HomeBlockKind, 'section'> } => s.kind !== 'section')
    .map((s) => ({ kind: s.kind, title: s.title, width: s.width }))
  const builtInOrder =
    configuredBuiltIns.length > 0
      ? configuredBuiltIns
      : (['browse', 'davening', 'listings', 'map', 'subscribe', 'jewishTimes'] as const).map((kind) => ({
          kind,
          title: BUILT_IN_BLOCKS[kind].title,
          width: 'full' as const,
        }))

  // Shared between mobile's permanent grid and desktop's search results —
  // see below for why the two don't share one JSX node any more.
  const noMatchesMessage = q && (filtered?.length ?? 0) === 0 && placeHits.length === 0 && (
    <p className="text-center text-sm text-slate-500">
      Nothing matches “{q}”. Try a different word or clear the filter.
    </p>
  )
  // No location set yet — same signal GenericDirectory's own addressPrompt
  // uses to hold each distance-based card's distance column open with a
  // placeholder instead of omitting it outright (see PlacesResults' own doc).
  const placesNode = placeHits.length > 0 && (
    <PlacesResults hits={placeHits} onOpen={openPlace} showDistanceSlot={!anchor.label} />
  )

  // Mobile's own permanent grid — this doubles as its whole "browse
  // everything", not just search results, so it always renders regardless
  // of `q`. Full CardGrid tiles, unchanged from before. Browsing (no query)
  // keeps the admin-configured section titles as real, large headings —
  // useful information architecture when there's no "Places" heading next
  // to it to clash with. Once there's a query, though, `placesNode` brings
  // its own small-caps "Places" heading into the same list, and a section
  // title sitting next to that read as a style mismatch — same fix as
  // desktop's own "Categories" vs "Food and Hospitality" (see
  // desktopResultsNode's own comment): one flat "Categories" heading,
  // styled like "Places", over every matching card regardless of section.
  const mobileResultsNode = (
    <>
      {noMatchesMessage}
      {loading ? (
        <CardGrid cards={entryCards} loadingCount={6} />
      ) : q ? (
        filtered &&
        filtered.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Categories</h2>
            <CardGrid cards={filtered} />
          </div>
        )
      ) : (
        sections.map((s) => (
          <div key={s.title}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{s.title}</h2>
            <CardGrid cards={s.cards} />
          </div>
        ))
      )}
      {placesNode}
    </>
  )

  // Desktop's own copy, shown only once there's a query, inside
  // SearchSection's own white box (see that component's own doc on why — a
  // search whose answer shows up somewhere else on the page reads as
  // disconnected). CompactCardGrid, not CardGrid: search results used to
  // fall back to the heavier photo-tile grid mobile uses, which read as a
  // jarring style switch from Browse everything's own small icon-avatar
  // rows the moment you typed anything — this keeps desktop looking like
  // desktop whether you're browsing or searching.
  //
  // One flat "Categories" heading over every matching card, not `sections`'
  // own admin-configured group titles ("Food and Hospitality", etc.) — those
  // exist to organize the tab nav's mega-menus and mobile's permanent grid,
  // and showing one here reads as a mismatch against "Places" right below
  // it, which is never split by category either. `filtered`, not `sections`,
  // is the flat list this needs (the same one `sections` itself groups from).
  const desktopResultsNode = q ? (
    <>
      {noMatchesMessage}
      {filtered && filtered.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Categories</h2>
          <CompactCardGrid
            cards={filtered}
            categories={categories}
            onCardClick={(card) => track('category_opened', { category: card.id ?? card.title, source: 'grid' })}
          />
        </div>
      )}
      {placesNode}
    </>
  ) : undefined

  // Jump to the map band when arriving from a collapsed fullscreen map. Waits
  // for the band to actually exist — on the first paint after navigating home
  // it may not be rendered yet (categories still loading, so `hasMap` is false).
  useEffect(() => {
    if (scrollTo !== 'map') return
    const el = mapBandRef.current
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    // mapBandRef comes from useInView, a useRef under the hood — stable
    // across renders, just not visible as such to eslint across the custom
    // hook boundary. Listed explicitly rather than suppressed.
  }, [scrollTo, hasMap, mapBandRef])

  // Tapping the tab bar's Home button, or the header logo, while already on
  // home doesn't remount this component — see goHome's own note — so it fires
  // this event instead to get the same "back to a clean home" result by hand:
  // clear whatever was typed and jump back to the top, the way a fresh mount
  // would if the URL had actually changed.
  useEffect(() => {
    function onGoHome() {
      setQuery('')
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    document.addEventListener('jpc:go-home', onGoHome)
    return () => document.removeEventListener('jpc:go-home', onGoHome)
  }, [])

  // The mobile back arrow's own directional reveal — SUPPOSED to come from
  // the ViewTransition below, but never does, because Next keeps this exact
  // component instance alive across that navigation instead of remounting
  // it, and ::view-transition-new only ever gets created opposite a real
  // unmount/mount pair (confirmed live via document.getAnimations() during
  // an actual nav-back — see `.reveal-slide-back`'s own doc in globals.css).
  // A plain CSS class stands in for it here instead.
  //
  // Watched via IntersectionObserver, not a React effect re-running or the
  // jpc:go-home listener above — confirmed live (an instrumented counter in
  // this exact effect) that NEITHER fires again on this reveal: Next hides
  // this whole screen behind the category page by some means invisible to
  // React (no re-render, no effect teardown/rerun, same effect instance the
  // entire time), so there's no React lifecycle hook for "just became
  // visible again" to attach to at all. IntersectionObserver reports real
  // layout/paint visibility straight from the browser, independent of
  // whether React ever re-renders — reliable exactly where the effect-based
  // attempts weren't. Gated on consumeHomeReveal() so an ordinary
  // scroll-driven intersection change (this element merely leaving and
  // re-entering the viewport) doesn't also trigger it — only a real
  // back-navigation ever sets that flag.
  //
  // An earlier version also skipped the observer's very first-ever
  // callback, on the theory that it always just reports pre-existing state
  // rather than a real transition. Confirmed live (an instrumented
  // callback wrapper against a real deployment) that this assumption is
  // false: this effect's own observer gets created around the FORWARD
  // navigation into a category (this element is already hidden by then,
  // not at true first mount as local testing had suggested), and the
  // browser coalesced the hide-then-reveal into a single callback — the
  // observer's first-ever invocation WAS the real "became visible again"
  // event, with no earlier "became hidden" callback to have been the
  // "harmless baseline" the skip was written for. Skipping it ate the
  // only signal that ever arrived. consumeHomeReveal() is already the
  // correct, sufficient gate on its own — a stray true baseline callback
  // only produces a false positive here if a real back-navigation also
  // happened to be pending at that exact instant, which is what the flag
  // means in the first place.
  const [backReveal, setBackReveal] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = mainRef.current
    if (!el || !isMobile) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry!.isIntersecting && consumeHomeReveal()) setBackReveal(true)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [isMobile])

  return (
    <>
      {/* pb-24 clears mobile's fixed bottom tab bar so the last card isn't
          hidden behind it — desktop has no such bar, so that padding just
          stacked on top of the footer's own mt-16/border-t below, leaving a
          much bigger gap after the last section than the footer intended. */}
      {/* ViewTransition: reacts only to a real navigation carrying a tagged
          transitionType ('nav-back', from a category's own back arrow — see
          SlugScreen/useSiteNavigation) — a no-op on desktop and on every
          other way of landing here (tab bar, logo, a fresh visit). See
          useNavTransitionProps' own doc. */}
      <ViewTransition {...navTransition}>
      <main
        ref={mainRef}
        // Sticks at reveal-slide-back permanently once a real back-nav
        // triggers it — deliberately never reset back to
        // animate-[fadeIn_180ms_ease-out] afterward. Swapping the class
        // back would change the animation-name property, which restarts
        // WHATEVER animation is newly named regardless of which one it
        // is — confirmed live (a real device) as the cause of a visible
        // flash/reload-looking stutter right after the slide finished:
        // fadeIn's own "from" state is opacity 0, so reapplying it on
        // already-fully-visible content briefly faded it back out and in
        // again. Leaving the class alone avoids that class-change
        // entirely. A later reveal (another back-navigation) still
        // replays the slide correctly with no JS involved: Next hides
        // this screen via display:none (see this effect's own doc), and
        // toggling display:none → visible restarts CSS animations on an
        // element on its own, same mechanism that made the plain fadeIn
        // replay before any of this existed — the className never has to
        // change for that part to keep working.
        className={`max-w-6xl mx-auto px-4 sm:px-6 pb-24 desktop:pb-0 ${backReveal ? 'reveal-slide-back' : 'animate-[fadeIn_180ms_ease-out]'}`}
      >
        {/* ── Heading + filter ───────────────────────────────────────────────── */}
        <HeroHeading settings={settings} query={query} onQueryChange={setQuery} />

        {/* ── Browse everything (desktop), one card ──────────────────────────
                `settings.heroTitle` titles the WHOLE card now, not just the
                grid below — search sits right under that title as the first
                thing in the section. `SearchSection` renders `bare` here (no
                card/section shell, and no heading of its own — `hideHeading`,
                since this card's own heading right above it already says the
                same thing) so it mounts once, as a stable sibling of the
                grid below, and never gets swapped out as a whole subtree
                when `q` changes — that would unmount the input mid-keystroke
                and drop focus.

                The grid itself is a flat, always-visible index of every
                card: every real category, Patient & Family Support,
                Volunteer, custom forms. Not grouped under the umbrella labels
                HeaderNav's own Categories menu uses ("Jewish Institutions and
                Information", etc.) — a visitor wants "Synagogues", not which
                invented group it lives under. HeaderNav's own "Categories"
                mega-menu (in SiteHeader now, on every screen — see that
                component's own doc for why it replaced the old below-header
                tab row) offers the same destinations grouped by those
                umbrella labels; this is a second, always-visible flat way to
                reach them for anyone who doesn't think to open that menu,
                not a replacement for it. Hidden while actively searching —
                the grouped grid further down already serves as live search
                results, and this card shows the search box's own `results`
                slot instead. `source: 'grid'` on the click lets the admin
                Metrics tab compare actual usage against HeaderNav's own
                `source: 'header-nav'`, so keeping both isn't a permanent
                guess.

                CompactCardGrid, not CardGrid — a list meant to hold every
                card at once got heavier with every category added and read
                as a wall of mismatched photo tiles (real photos, flat tints,
                still-loading placeholders, side by side). See that
                component's own doc for why a small icon-avatar row instead
                of a full photo tile is the fix.

                The ring-1/rounded-2xl wrapper matches the map's own
                container below — the two are meant to read as equal "main
                things". Every card between them (Davening Times, Update
                Listings, Email Signup, Jewish Times) uses the same card
                language (border, rounded-2xl) as this section, so the whole
                stack reads as one family. */}
        {/* ── The desktop gateway's six singleton cards — Categories &
                Search, Davening Times, Update Listings, Map, Email Signup,
                Jewish Times — in the admin-configured order (builtInOrder
                above), and now optionally paired side by side (see
                homeSections.ts's own `width` doc). Each card keeps only the
                gating it actually needs on its own merits — Davening Times
                self-gates on having a minyanim-bearing category at all
                (inside DaveningTimesCard), Jewish Times gates on a real
                Zmanim pseudo-category existing (candle-lighting data has
                nowhere to come from otherwise), and Update Listings/Email
                Signup need neither.

                cardKindContent below returns just each card's own inner box
                — no outer margin, no row wrapper — so the SAME content can
                land either in its own full-width row or share a 2-column
                row with a neighbor. Pairing happens AFTER gating: two
                'half' cards are only paired if BOTH actually rendered
                something (cardKindContent didn't return null) — a 'half'
                card whose would-be partner is gated off that render (or is
                itself the last card) falls back to a full-width row of its
                own, so a lone half-width card never looks like a mistake. */}
        {(() => {
          function cardKindContent(kind: (typeof builtInOrder)[number]['kind']): React.ReactNode {
          if (kind === 'browse') {
            // `settings.desktopBrowseEyebrow`/`desktopBrowseHeading` title
            // the WHOLE card, not just the grid below — search sits right
            // under that heading as the first thing in the section.
            // `SearchSection` renders `bare` here (no card/section shell,
            // and no heading of its own — `hideHeading`, since this card's
            // own heading right above it already says the same thing) so it
            // mounts once, as a stable sibling of the grid below, and never
            // gets swapped out as a whole subtree when `q` changes — that
            // would unmount the input mid-keystroke and drop focus.
            //
            // The grid itself is a flat, always-visible index of every
            // card. CompactCardGrid, not CardGrid — see that component's
            // own doc for why a small icon-avatar row instead of a full
            // photo tile is the fix for a list this long.
            return (
              <div className="hidden desktop:block rounded-2xl bg-white p-5 ring-1 ring-slate-900/5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {settings.desktopBrowseEyebrow}
                  </p>
                  <h2 className="mb-6 text-lg font-semibold text-slate-900">{settings.desktopBrowseHeading}</h2>
                  <SearchSection
                    bare
                    hideHeading
                    heroTitle={settings.desktopBrowseHeading}
                    searchPlaceholder={settings.searchPlaceholder}
                    query={query}
                    onQueryChange={setQuery}
                    results={!isMobile ? desktopResultsNode : undefined}
                  />
                  {!isMobile && !q && (
                    <div className={ui.search.landing ? 'mt-6' : ''}>
                      <CompactCardGrid
                        cards={loading ? entryCards : (filtered ?? [])}
                        categories={categories}
                        onCardClick={(card) => track('category_opened', { category: card.id ?? card.title, source: 'grid' })}
                      />
                    </div>
                  )}
              </div>
            )
          }
          if (kind === 'davening') {
            // No outer zmanimCategory gate any more — that was this card's
            // old shared-component sibling's requirement (ShabbatTimesCard's
            // useZmanim), not this card's own. DaveningTimesCard already
            // self-gates on having any minyanim-bearing category at all
            // (returns null otherwise), which is the real requirement here.
            return (
              !isMobile && (
                <DaveningTimesCard
                  coords={coords}
                  eyebrow={settings.desktopDaveningEyebrow}
                  heading={settings.desktopDaveningHeading}
                />
              )
            )
          }
          if (kind === 'listings') {
            // Unconditional (no zmanimCategory gate) — this card has never
            // depended on zmanim data; it was only ever gated because it
            // used to share a component (HomeBreak) with Davening Times.
            return !isMobile && (
              <UpdateListingsCard
                eyebrow={settings.desktopListingsEyebrow}
                heading={settings.desktopListingsHeading}
              />
            )
          }
          if (kind === 'subscribe') {
            // Also unconditional — SubscribeSection doesn't read zmanim
            // data either; it only used to pair visually with
            // ShabbatTimesCard, not depend on it.
            return (
              !isMobile && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <SubscribeSection
                    bare
                    eyebrow={settings.desktopSubscribeEyebrow}
                    heading={settings.desktopSubscribeHeading}
                  />
                </div>
              )
            )
          }
          if (kind === 'jewishTimes') {
            // Still a JS branch on zmanimCategory: useZmanim fetches
            // /api/zmanim uncached, straight through to Hebcal, and hiding
            // this with CSS alone would cost every phone visitor a
            // round-trip for a card they never see (mobile has no
            // equivalent of this card at all) — same reasoning as before
            // the Davening+Listings/Subscribe+JewishTimes pairs split.
            return (
              !isMobile &&
              zmanimCategory && (
                <ShabbatTimesCard
                  coords={coords ?? community.mapCenter}
                  locationLabel={zmanimLocationLabel}
                  heading={settings.desktopJewishTimesHeading}
                />
              )
            )
          }
          if (kind === 'map') {
            // The real full map screen, right on the home screen. Desktop
            // only: mobile reaches the same map via its own tab bar entry, so
            // it's dropped from this scroll to avoid showing it twice. Stays
            // up while searching, unlike Browse everything above it — search
            // results are now their own thing (see SearchSection's own
            // `results` slot), not something this needs to make room for by
            // disappearing; the map is independent content, not an answer to
            // what was typed. `scroll-mt` clears the sticky site header, so scrolling
            // this band into view (arriving from a collapsed fullscreen map)
            // doesn't tuck its heading underneath it.
            //
            // The heading sits inside the same rounded-2xl/ring-1 card as the
            // map now, matching Browse everything's own card — HomeMap passes
            // `borderless` to ResourceMapView so the map doesn't draw its own
            // border inside this one (see that prop's own doc for why: this
            // component is shared with the full map screen, which still owns
            // its border the old way). overflow-hidden here is what clips the
            // now-borderless map's square corners to match this card's
            // rounded ones — ResourceMapView already clips its own contents
            // the same way internally, so this adds no new clipping behavior,
            // just extends the same shape one level out. Not a risk to the
            // fullscreen expand-in-place transition either: fullscreen goes
            // `fixed inset-0`, which escapes this ancestor's overflow/rounding
            // entirely regardless of what wraps it.
            return hasMap && (
              <div ref={mapBandRef} className="hidden scroll-mt-20 desktop:block overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/5">
                  <div className="px-5 pt-5 pb-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      {settings.desktopMapEyebrow}
                    </p>
                    {/* Same eyebrow/heading rhythm as every other card —
                        both admin-editable now (Desktop tab's Home screen
                        cards), no longer a hardcoded eyebrow next to a
                        home_section.title-driven heading. The count fades
                        in once listings have loaded rather than reserving
                        space for it; a header that's briefly one line
                        shorter reads fine, a wrong number wouldn't. */}
                    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                      <h2 className="text-lg font-semibold text-slate-900">{settings.desktopMapHeading}</h2>
                      {totalListings != null && (
                        <p className="text-sm text-slate-500">
                          <span className="font-semibold text-slate-700">{totalListings.toLocaleString()}</span>{' '}
                          place{totalListings === 1 ? '' : 's'} across {listingCategories.length}{' '}
                          categor{listingCategories.length === 1 ? 'y' : 'ies'}
                        </p>
                      )}
                    </div>
                  </div>
                  {mapInView ? (
                    <HomeMap onNavigate={onNavigate} coords={coords} liveTracking={liveTracking} controls={controls} />
                  ) : (
                    // Same footprint as ResourceMapView's own embedded-mode
                    // container (desktop:h-[70vh] desktop:min-h-[420px]) so
                    // swapping in the real map once mapInView flips true
                    // doesn't shift anything below it. No rounding/ring of
                    // its own now — the wrapping card above already owns that.
                    <div className="h-[70vh] min-h-[420px] bg-slate-100" />
                  )}
              </div>
            )
          }
          return null
          }

          // Pairing happens AFTER gating (see the comment above) — build the
          // rendered, non-empty cards first, THEN walk them looking for two
          // adjacent 'half' cards to combine into one row.
          const renderedCards = builtInOrder
            .map(({ kind, width }) => ({ kind, width, node: cardKindContent(kind) }))
            .filter((c): c is typeof c & { node: React.ReactElement } => Boolean(c.node))

          const rows: { key: string; node: React.ReactNode }[] = []
          for (let i = 0; i < renderedCards.length; i++) {
            const cur = renderedCards[i]!
            const next = renderedCards[i + 1]
            if (cur.width === 'half' && next?.width === 'half') {
              rows.push({
                key: `${cur.kind}-${next.kind}`,
                node: (
                  // NOT `desktop:` (640px) — that breakpoint answers "is this
                  // a phone", not "is there room for two half cards side by
                  // side", and reusing it here paired them at widths where
                  // neither card had enough room. Update Listings' three
                  // buttons need ~465-470px of content box just on their own
                  // (see UpdateListingsCard's own doc) — once you subtract
                  // this grid's gap-4 and each card's own p-7, pairing below
                  // ~1220px left a column too narrow for that, wrapping
                  // "Report" onto its own row. Below this, both cards stack
                  // full-width instead, each getting the whole content
                  // column — comfortably more room than either needs.
                  <div className="grid grid-cols-1 gap-4 min-[1220px]:grid-cols-2">
                    {cur.node}
                    {next.node}
                  </div>
                ),
              })
              i++ // consumed both
            } else {
              rows.push({ key: cur.kind, node: cur.node })
            }
          }

          return rows.map((row) => (
            <div key={row.key} className="my-12">
              {row.node}
            </div>
          ))
        })()}

        {/* ── The grid (mobile) — grouped into labeled sections; a search
                narrows each section's cards and hides any section left
                empty. Desktop's own copy of this same content (styled
                differently — see desktopResultsNode's own doc) lives inside
                SearchSection above instead. Plain CSS `desktop:hidden`, not
                an isMobile branch: mobile needs this correct on the very
                first paint, with no prior interaction, which only a CSS
                media query (not a value React doesn't know for certain
                until after hydration) can guarantee. ─────────────────────── */}
        <section className="mt-12 sm:mt-14 space-y-10 desktop:hidden">{mobileResultsNode}</section>
      </main>
      </ViewTransition>
    </>
  )
}
