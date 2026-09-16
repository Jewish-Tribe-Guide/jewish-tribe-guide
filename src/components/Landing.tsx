'use client'

import { useEffect, useMemo, useRef, useState, ViewTransition } from 'react'
import { track } from '@vercel/analytics'
import { CardGrid, CategoryTileRow, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import DaveningTimesCard from '@/components/home/DaveningTimesCard'
import UpdateListingsCard from '@/components/home/UpdateListingsCard'
import SuggestListingCard from '@/components/home/SuggestListingCard'
import ShabbatTimesCard from '@/components/home/ShabbatTimesCard'
import SubscribeSection from '@/components/home/SubscribeSection'
import CampaignBannerCard from '@/components/home/CampaignBannerCard'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { BUILT_IN_BLOCKS, type HomeBlockKind } from '@/lib/homeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useIsMobile } from '@/lib/useIsMobile'
import { useNavTransitionProps } from '@/lib/navTransitions'
import { consumeHomeReveal } from '@/lib/homeRevealSignal'
import { useLocation } from '@/lib/locationContext'
import { useHeaderOverlay } from '@/lib/headerVisibility'
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
   *  distance, exactly like the category directory does, and feeds the
   *  Davening Times/Shabbat & Holiday Times cards' own nearest-location calc. */
  coords: { lat: number; lng: number } | null
}

// ── The home screen ───────────────────────────────────────────────────────────
// Desktop and mobile deliberately differ here (see the desktop-redesign notes):
//
//   Desktop — a two-column warm hero (headline + subhead + search beside a
//   photo, see HeroHeading) → five independent, admin-orderable cards (see
//   builtInOrder): Categories & Search (a flat "Browse everything" grid,
//   full weight — every card, always visible, no hover needed), Davening
//   Times, Update Listings ("kept by the community"), Email Signup (Stay in
//   the Loop), and Jewish Times (Shabbat & Holiday Times) — → footer. The map
//   itself lives at its own full-screen route (the hero's "View Map" button,
//   header nav, or the mobile tab bar), never embedded here — that used to be
//   a sixth card (BUILT_IN_BLOCKS' `'map'` kind); retired, the user's own
//   call. HeaderNav's "Categories" mega-menu (in SiteHeader, on every screen
//   — this page no longer owns any category nav of its own) is a second way
//   to reach a category, on top of the flat grid.
//
//   Mobile — unchanged: hero + search, then the full grouped card grid inline,
//   no map (it has its own tab for that).
//
// Typing filters the grid live against each card's hidden keywords (so "shul"
// surfaces Synagogues). On desktop, where the grid isn't on screen, typing
// reveals it inline as a results list — a search that appeared to do nothing
// would be worse than a slightly longer page.
export default function Landing({ onNavigate, onOpenFlow, coords }: LandingProps) {
  const communitySlug = useCommunitySlug()
  const categories = useCategories()
  const homeSections = useHomeSections()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  // "View all" (desktop "Explore by Category" card) — collapsed shows the
  // first COLLAPSED_TILE_COUNT cards plus a trailing "More" tile, expanded
  // shows every card in a full wrapped grid. Lives here, not inside
  // CategoryTileRow itself: two different things can trigger it (the
  // header row's own "View all" toggle, and the grid's own trailing "More"
  // tile), so the state has to be shared rather than owned by the grid
  // alone.
  const [browseExpanded, setBrowseExpanded] = useState(false)
  // The hero's "Browse Categories" button scrolls here.
  const browseCardRef = useRef<HTMLDivElement>(null)
  const settings = useSiteSettings()
  // Desktop only (see headerVisibility.tsx/SiteHeader): lets the header sit
  // transparent over this screen's photo hero until scrolled past it.
  useHeaderOverlay(true)
  const entryCards = useEntryCards(onOpenFlow)
  const isMobile = useIsMobile()
  const navTransition = useNavTransitionProps()
  const { anchor } = useLocation()
  // The Map pseudo-category still gates whether the map shows at all — also
  // doubles as the hero's "View Map" button gate (mapIcon below).
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  // The Map pseudo-category's own icon — shown on the hero's "View Map"
  // button the same way HeroHeading already accepts it. Null
  // (not just absent) while categories haven't loaded yet or there's no Map
  // category configured, which is what keeps the button from rendering at
  // all (see HeroHeading's own `mapIcon != null` check).
  const mapIcon = categories?.find((c) => c.kind === 'map')?.icon ?? null
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

  // Tapping a place opens its category directory with just that place
  // expanded — not also pre-filtered to the matched search term. That used
  // to carry the term along as `?q=`, on the reasoning that it'd survive
  // closing the modal back to a relevant list — the user's own call,
  // reviewing it live: picking a listing should show exactly that listing,
  // not a filtered category page underneath it. Edit/Report additionally
  // carry `findAction` so the directory opens straight into that form
  // instead of just the expanded card.
  const openPlace = (hit: (typeof placeHits)[number], action?: 'edit' | 'report') => {
    if (!action) track('listing_opened', { listing: hit.item.name, category: hit.item.category, source: 'search' })
    onNavigate('patient', 'find', {
      findView: hit.item.category,
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
      : (['browse', 'davening', 'listings', 'subscribe', 'jewishTimes'] as const).map((kind) => ({
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
        className={`max-w-6xl desktop:max-w-7xl mx-auto px-4 sm:px-6 pb-24 desktop:pb-0 ${backReveal ? 'reveal-slide-back' : 'animate-[fadeIn_180ms_ease-out]'}`}
      >
        {/* ── Heading + filter ───────────────────────────────────────────────── */}
        <HeroHeading
          settings={settings}
          query={query}
          onQueryChange={setQuery}
          mapIcon={hasMap ? mapIcon : null}
          onViewMap={() => onNavigate(null, 'map')}
          onBrowseCategories={() => {
            // Also expands the row (the same thing the "More" tile's own
            // click does), not just a scroll — "Browse Categories" reads as
            // "show me everything," so landing on the same capped 9+More
            // row a visitor would've scrolled to on their own defeats the
            // button's own promise.
            setBrowseExpanded(true)
            browseCardRef.current?.scrollIntoView({ block: 'start' })
          }}
          searchCards={filtered}
          searchPlaceHits={placeHits}
          categories={categories}
          onSearchCardClick={(card) => track('category_opened', { category: card.id ?? card.title, source: 'hero-search' })}
          onOpenSearchPlace={(hit) => openPlace(hit)}
        />

        {/* ── Seasonal campaign banner ─────────────────────────────────────────
                Renders nothing outside its own admin-set date range (see the
                component's own doc). Common to both layouts — sits above the
                desktop card stack below AND the mobile `desktop:hidden` grid
                further down — so one element here, no isMobile branch, is a
                banner "near the top" on both. Not part of builtInOrder/
                cardKindContent: it isn't admin-orderable among those cards,
                just a plain "is one active" check, same shape as
                hasMap/zmanimCategory above. ─────────────────────────────── */}
        <div className="mt-8">
          <CampaignBannerCard />
        </div>

        {/* ── Browse everything (desktop), one card ──────────────────────────
                `settings.heroTitle` titles the WHOLE card now, not just the
                grid below. No search box of its own — the hero's own search
                box (HeroHeading) drives `query`/`setQuery`, but this card
                doesn't react to it any more: it used to swap its whole grid
                for a dense CompactCardGrid of search matches the moment `q`
                was set, back when there was nowhere else on screen for a
                search's answer to show up. HeroSearchDropdown (opening right
                under the hero's own search box) replaced that job, so this
                card stays the plain category index regardless of what's
                typed — one search, one place its results appear, not two
                things reacting to the same keystroke.

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
                not a replacement for it. `source: 'grid'` on the click lets
                the admin Metrics tab compare actual usage against
                HeaderNav's own `source: 'header-nav'` and HeroSearchDropdown's
                own `source: 'hero-search'`, so keeping all three isn't a
                permanent guess.

                The ring-1/rounded-2xl wrapper matches the map's own
                container below — the two are meant to read as equal "main
                things". Every card between them (Davening Times, Update
                Listings, Email Signup, Jewish Times) uses the same card
                language (border, rounded-2xl) as this section, so the whole
                stack reads as one family. */}
        {/* ── The desktop gateway's cards — Categories & Search, Davening
                Times, Update Listings, Map, Email Signup, Jewish Times, plus
                the new Suggest a Listing — in the admin-configured order
                (builtInOrder above), and now optionally paired side by side
                (see homeSections.ts's own `width` doc). Each card keeps only
                the gating it actually needs on its own merits — Davening
                Times self-gates on having a minyanim-bearing category at all
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
                own, so a lone half-width card never looks like a mistake.

                Davening Times and Update Listings are the one exception to
                that generic per-kind path: the desktop mockup (Phase 6,
                docs/desktop-mockup-plan.md) puts them in one 3-up
                "community" row together with Suggest a Listing (a card with
                no `width`/kind of its own in the database — card widths
                there are only 'full' | 'half', and kinds are fixed by a DB
                constraint, so there's nowhere to hang a generic pairing rule
                for a third card). See the renderedCards walk below, which
                intercepts those two kinds specifically instead of routing
                them through cardKindContent. */}
        {(() => {
          function cardKindContent(kind: (typeof builtInOrder)[number]['kind']): React.ReactNode {
          if (kind === 'browse') {
            // `settings.desktopBrowseEyebrow`/`desktopBrowseHeading` title
            // the WHOLE card — left side of the header row, with the "View
            // all" toggle on the right. No search box of its own (see the
            // section comment above this card) — and, since
            // HeroSearchDropdown started giving the hero's own search box a
            // live results panel of its own, this card no longer reacts to
            // `query` at all: always the full, unfiltered category index,
            // never a filtered/search-results view. It used to swap in a
            // dense CompactCardGrid of search matches the moment `q` was
            // set — with a real results panel opening right where a visitor
            // is already looking, having this section ALSO change out from
            // under them read as two different things happening for one
            // search, not one.
            //
            // The grid itself is a flat index of every card, sorted by
            // listing count (most to least places) rather than the source
            // order resourceCards/entryCards happens to build — matching
            // the user's own reference image. Collapsed shows the first
            // COLLAPSED_TILE_COUNT plus a trailing "More" tile (no
            // scrolling, no wrap — see CategoryTileRow's own doc); "View
            // all" (here or the "More" tile itself) expands it into a full
            // wrapped grid instead.
            const browseCards = [...(loading ? entryCards : (allCards ?? []))].sort(
              (a, b) => (listingCounts?.[b.id ?? ''] ?? 0) - (listingCounts?.[a.id ?? ''] ?? 0),
            )
            return (
              // scroll-mt-24 clears the sticky site header when this card is
              // scrolled into view (the "Browse Categories" hero button).
              <div
                ref={browseCardRef}
                data-testid="browse-everything-card"
                className="hidden scroll-mt-24 desktop:block rounded-2xl bg-white px-8 pt-6 pb-3 ring-1 ring-slate-900/5"
              >
                  {/* Hardcoded, not settings.desktopBrowseEyebrow/Heading —
                      the user's own reference image titles this "Explore
                      by Category" with no small eyebrow label above it,
                      unlike every other card on this page. The admin
                      fields still exist (DesktopTopicsManager) but have no
                      render site left here. "Show fewer categories" sits up
                      here, top-right of the heading, once expanded — the
                      user's own call, moving it back from below the grid
                      (where the "More" tile it collapses used to be). */}
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-serif text-2xl font-bold text-ink">Explore by Category</h2>
                    {browseExpanded && (
                      <button
                        type="button"
                        onClick={() => setBrowseExpanded(false)}
                        aria-expanded={browseExpanded}
                        className="shrink-0 cursor-pointer text-sm font-semibold text-ink transition-colors hover:text-brand-teal"
                      >
                        Show fewer categories
                      </button>
                    )}
                  </div>
                  {!isMobile && (
                    <div className={ui.search.landing ? 'mt-3' : ''}>
                      <CategoryTileRow
                        cards={browseCards}
                        categories={categories}
                        expanded={browseExpanded}
                        onCardClick={(card) => track('category_opened', { category: card.id ?? card.title, source: 'grid' })}
                        onExpand={() => setBrowseExpanded(true)}
                      />
                    </div>
                  )}
              </div>
            )
          }
          // 'davening'/'listings' are NOT handled here any more — see the
          // community-row special case in the renderedCards walk below,
          // which merges them with Suggest a Listing into one row instead
          // of each getting its own.
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
          // 'map' — the old embedded map band — is retired (the user's own
          // call: the map lives at its own full-screen route now, reached via
          // the hero's "View Map" button/header nav/tab bar, never embedded
          // on the home screen). Falls through to `return null` below like
          // any other retired kind (see BUILT_IN_BLOCKS's own doc) — a
          // community with an old 'map' row in its home_sections just
          // silently renders nothing for it, same as 'zmanim'/'shabbat'/
          // 'featured' before it.
          return null
          }

          // Pairing happens AFTER gating (see the comment above) — build the
          // rendered, non-empty cards first, THEN walk them looking for two
          // adjacent 'half' cards to combine into one row.
          //
          // 'davening'/'listings' get a special case here rather than going
          // through cardKindContent like every other kind: the desktop
          // mockup (Phase 6, docs/desktop-mockup-plan.md) puts Davening
          // Times, Update Listings and the new Suggest a Listing card in one
          // 3-up "community" row instead of each kind getting its own row —
          // Suggest a Listing has no `width`/kind of its own in the database
          // (card widths there are only ever 'full' | 'half', and kinds are
          // fixed by a DB constraint) to hang a generic pairing rule off of,
          // so the row is built by hand at whichever of the two configured
          // kinds the walk reaches FIRST, and the other is skipped when the
          // walk reaches it. Their own `width` values are ignored for this
          // row — same reasoning CardKindContent's half-pairing below has no
          // say here either. Every other kind (Subscribe + Jewish Times
          // still pair) goes through the normal path untouched.
          const renderedCards: { kind: string; width: 'full' | 'half'; node: React.ReactElement }[] = []
          let communityRowRendered = false
          for (const { kind, width } of builtInOrder) {
            if (kind === 'davening' || kind === 'listings') {
              if (communityRowRendered) continue
              communityRowRendered = true
              const hasDavening = builtInOrder.some((b) => b.kind === 'davening')
              const hasListings = builtInOrder.some((b) => b.kind === 'listings')
              const communityCards: React.ReactElement[] = []
              if (hasDavening && !isMobile) {
                communityCards.push(
                  <DaveningTimesCard key="davening" coords={coords} />,
                )
              }
              if (hasListings && !isMobile) {
                communityCards.push(
                  <UpdateListingsCard key="listings" eyebrow={settings.desktopListingsEyebrow} heading={settings.desktopListingsHeading} />,
                )
              }
              // Suggest a Listing — always present, when the row renders at
              // all (i.e. desktop, and at least one of the other two kinds
              // is configured).
              if (!isMobile) communityCards.push(<SuggestListingCard key="suggest" />)
              if (communityCards.length === 0) continue

              const communityRowClass =
                communityCards.length === 3
                  ? 'grid gap-5 min-[900px]:grid-cols-3'
                  : communityCards.length === 2
                    ? 'grid gap-5 min-[740px]:grid-cols-2'
                    : 'grid gap-5'
              renderedCards.push({
                kind: 'community',
                width: 'full',
                node: <div className={communityRowClass}>{communityCards}</div>,
              })
              continue
            }
            const node = cardKindContent(kind)
            // Truthy-narrowed, same as the old `.filter` predicate this
            // replaced: cardKindContent's return type is the broader
            // React.ReactNode (it can return `false` from an `isMobile &&`
            // gate), but a truthy value here is always the real element.
            if (node) renderedCards.push({ kind, width, node: node as React.ReactElement })
          }

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
                  // neither card had enough room, wrapping Update Listings'
                  // "Report" onto its own line.
                  //
                  // Not a fixed width tuned to the LONG labels either — that
                  // gave up pairing at any width under ~1100px even though
                  // ContributeButton's own @container already crunches down
                  // to short labels ("Add a place" → "Add") well before then.
                  // The real constraint is narrower: at what width do even
                  // the SHORT labels stop fitting three-across? Measured
                  // directly against a production build by sweeping the
                  // width where the grid pairs: wraps at 730px, clear at
                  // 735px, ~33px of margin to spare by 740px. Below 740,
                  // both cards stack full-width instead, each getting the
                  // whole content column — this is the actual "crunch until
                  // it'd look bad, then give up and stack" behavior, not a
                  // fixed guess at long-label math.
                  <div className="grid grid-cols-1 gap-4 min-[740px]:grid-cols-2">
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
            <div key={row.key} className="my-8">
              {row.node}
            </div>
          ))
        })()}

        {/* ── The grid (mobile) — grouped into labeled sections; a search
                narrows each section's cards and hides any section left
                empty. Desktop's own copy of this same content (styled
                differently — see desktopResultsNode's own doc) lives inside
                the "Browse everything" card above instead. Plain CSS
                `desktop:hidden`, not an isMobile branch: mobile needs this
                correct on the very first paint, with no prior interaction,
                which only a CSS
                media query (not a value React doesn't know for certain
                until after hydration) can guarantee. ─────────────────────── */}
        <section className="mt-12 sm:mt-14 space-y-10 desktop:hidden">{mobileResultsNode}</section>
      </main>
      </ViewTransition>
    </>
  )
}
