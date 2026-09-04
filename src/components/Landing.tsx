'use client'

import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'
import { CardGrid, CompactCardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import SearchSection from '@/components/home/SearchSection'
import SubscribeSection from '@/components/home/SubscribeSection'
import HomeMap from '@/components/home/HomeMap'
import type { LocationControls } from '@/components/home/LocationControl'
import SectionTabs from '@/components/home/SectionTabs'
import FeaturedCards from '@/components/home/FeaturedCards'
import HomeBreak from '@/components/home/HomeBreak'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { BUILT_IN_BLOCKS, type HomeBlockKind } from '@/lib/homeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useInView } from '@/lib/useInView'
import { useLocation } from '@/lib/locationContext'
import { pickFeaturedCards } from '@/lib/featuredCards'
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
//   Desktop — section tabs (hover mega-menus, kept alongside the grid below
//   rather than replaced by it — see the "keep it just in case" note on the
//   grid itself) → a two-column warm hero (headline + mission + search
//   beside a photo, see HeroHeading) → "Popular right now" if an admin has
//   re-added it (off by default — see builtInOrder) → a flat "Browse
//   everything" grid, full weight (every card, always visible, no hover
//   needed) → HomeBreak, two smaller cards side by side (the full daily
//   Zmanim, and a "kept by the community" message) between the two main
//   sections → "Explore the map", matching Browse everything's full weight
//   → footer. The section tabs' mega-menus are a second way to reach a
//   category, on top of the flat grid.
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
  const { anchor } = useLocation()
  // The Map pseudo-category still gates whether the map shows at all.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')
  // Same as the real Zmanim & Shabbos category page (FindResources' own
  // locationLabel) — the visitor's typed address, or the community's region,
  // never the site's own name.
  const zmanimLocationLabel = anchor.label || community.region

  const resources = resourceCards(onNavigate, categories, communitySlug)
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
  // The tabs list every section regardless of the current search — they're
  // site navigation, not search results, and shouldn't empty out mid-type.
  const navSections = allCards ? groupCardsIntoSections(allCards, homeSections ?? []) : []
  const featured = allCards ? pickFeaturedCards(allCards, listings, settings.featuredCardIds) : []

  // The desktop gateway's own block order (admin-editable — see
  // HomeSectionManager). Category sections don't interleave here — the flat
  // "Browse everything" grid below shows every category on its own, ordered
  // by this same `homeSections` list; this is just "which of the three
  // singleton blocks show, in what order". A community
  // that's never touched the ordering has all three, in their original
  // hardcoded order, via seed-home-blocks.mjs — and the same default order
  // is the fallback here too, for a deployment that hasn't run that script
  // (or a fixture/test that predates this) so the gateway still shows all
  // three rather than silently going blank until someone runs a migration.
  // Known tradeoff: this can't distinguish "never configured" from "an admin
  // deliberately removed all three" — both look like zero built-in rows —
  // so the rare case of removing every one of them reverts to the default
  // set on the next load rather than staying empty. Removing one or two
  // sticks; only removing all three hits this.
  const configuredBuiltIns = (homeSections ?? [])
    .filter((s): s is typeof s & { kind: Exclude<HomeBlockKind, 'section'> } => s.kind !== 'section')
    .map((s) => ({ kind: s.kind, title: s.title }))
  // 'featured' ("Popular right now") isn't in this default any more — it's a
  // curated subset of exactly what the "Browse everything" grid above
  // already shows in full, so on a fresh community it would just repeat
  // three of those same cards a second time. Still fully supported: an admin
  // can add it back from the "+ Add" built-in-block button in the Desktop &
  // mobile tab for a community that wants a curated highlight anyway.
  const builtInOrder =
    configuredBuiltIns.length > 0
      ? configuredBuiltIns
      : (['zmanim', 'map'] as const).map((kind) => ({ kind, title: BUILT_IN_BLOCKS[kind].title }))

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
  // of `q`. Full CardGrid tiles, unchanged from before.
  const mobileResultsNode = (
    <>
      {noMatchesMessage}
      {loading ? (
        <CardGrid cards={entryCards} loadingCount={6} />
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
  const desktopResultsNode = q ? (
    <>
      {noMatchesMessage}
      {sections.map((s) => (
        <div key={s.title}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{s.title}</h2>
          <CompactCardGrid
            cards={s.cards}
            categories={categories}
            onCardClick={(card) => track('category_opened', { category: card.id ?? card.title, source: 'grid' })}
          />
        </div>
      ))}
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

  return (
    <>
      {/* ── Section tabs (desktop) — kept alongside the flat "Browse
              everything" grid below as a second way to reach a category (see
              that section's own comment). Full-bleed so the bar spans the
              window while its contents stay aligned to the page. ─────────── */}
      <SectionTabs
        sections={navSections}
        listings={listings}
        onOpenCard={(card) => card.go()}
      />

      {/* pb-24 clears mobile's fixed bottom tab bar so the last card isn't
          hidden behind it — desktop has no such bar, so that padding just
          stacked on top of the footer's own mt-16/border-t below, leaving a
          much bigger gap after the last section than the footer intended. */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 desktop:pb-0">
        {/* ── Heading + filter ───────────────────────────────────────────────── */}
        <HeroHeading settings={settings} query={query} onQueryChange={setQuery} />

        {/* ── Browse everything (desktop), one card ──────────────────────────
                "Browse everything" titles the WHOLE card now, not just the
                grid below — search sits right under that title as the first
                thing in the section, its own "What are you looking for?"
                heading intact (kept on purpose: the box read as bare without
                it). `SearchSection` renders `bare` here (no card/section
                shell of its own) so it mounts once, as a stable sibling of
                the grid below, and never gets swapped out as a whole subtree
                when `q` changes — that would unmount the input mid-keystroke
                and drop focus.

                The grid itself is a flat, always-visible index of every
                card: every real category, Patient & Family Support,
                Volunteer, custom forms. Not grouped under the section tabs'
                own umbrella labels above ("Jewish Institutions and
                Information", etc.) — a visitor wants "Synagogues", not which
                invented group it lives under. The tab nav's hover mega-menus
                stay exactly as they are; this is a second, always-visible way
                to reach the same destinations for anyone who doesn't think to
                hover, not a replacement. Hidden while actively searching —
                the grouped grid further down already serves as live search
                results, and this card shows the search box's own `results`
                slot instead. `source: 'grid'` on the click lets the admin
                Metrics tab compare actual usage against the tab nav's own
                `source: 'tab-nav'` (see SectionTabs), so keeping both isn't a
                permanent guess.

                CompactCardGrid, not CardGrid — a list meant to hold every
                card at once got heavier with every category added and read
                as a wall of mismatched photo tiles (real photos, flat tints,
                still-loading placeholders, side by side). See that
                component's own doc for why a small icon-avatar row instead
                of a full photo tile is the fix.

                The ring-1/rounded-2xl wrapper matches the map's own
                container below — the two are meant to read as equal "main
                things". HomeBreak, the transition between them, uses the
                same card language (border, rounded-2xl) as this section —
                see its own doc on why two smaller cards there still reads as
                a pair, not a third full-width peer section. */}
        <section className="mt-8 hidden desktop:block">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-900/5">
            <h2 className="mb-6 text-lg font-semibold text-slate-900">Browse everything</h2>
            <SearchSection
              bare
              heroTitle={settings.heroTitle}
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
        </section>

        {/* ── The desktop gateway's three singleton blocks — featured cards,
                the embedded map, Zmanim & Shabbos — in the admin-configured
                order (builtInOrder above). Each keeps its own existing gating
                (hidden while searching, desktop-only, hasMap/zmanimCategory);
                only the SEQUENCE they render in is now data-driven instead of
                hardcoded. ─────────────────────────────────────────────────── */}
        {builtInOrder.map(({ kind, title }) => {
          if (kind === 'featured') {
            // Hidden while searching, when the grid below takes over as the
            // answer to what was typed.
            return !q && (
              <div key="featured" className="hidden desktop:block">
                <FeaturedCards title={title} cards={featured} loading={loading} />
              </div>
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
              <div key="map" ref={mapBandRef} className="mt-14 hidden scroll-mt-20 desktop:block">
                <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/5">
                  <h2 className="px-5 pt-5 pb-4 text-lg font-semibold text-slate-900">{title}</h2>
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
              </div>
            )
          }
          // Zmanim & Shabbos — HomeBreak's own full daily zmanim card here
          // (see its own doc). Falls back to the community
          // center so it renders something real before the visitor has set
          // an address. Still a JS branch, unlike the other two, and
          // deliberately: HomeBreak calls useZmanim, which fetches
          // /api/zmanim — uncached, straight through to Hebcal. Rendering it
          // and hiding it with `sm:` would cost every phone visitor a
          // round-trip for a section they never see. CSS should own a
          // layout difference; it shouldn't own one that costs a request.
          // The one-frame correction is the cheaper error here, and nothing
          // above the fold moves when it happens.
          return (
            !isMobile && zmanimCategory && (
              <HomeBreak
                key="zmanim"
                coords={coords ?? community.mapCenter}
                locationLabel={zmanimLocationLabel}
              />
            )
          )
        })}

        {/* ── Stay in the loop — desktop only, bottom of the page's own
                content (after all three of the reorderable blocks above,
                regardless of their admin-configured order) — see
                SubscribeSection's own doc. Stays up while searching too,
                same as the map/Zmanim above it — see that block's own note
                on why only Browse everything (the one thing search results
                actually replace) hides. ──────────────────────────────── */}
        {!isMobile && <SubscribeSection />}

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
    </>
  )
}
