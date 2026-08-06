'use client'

import { useEffect, useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import HomeMap from '@/components/home/HomeMap'
import SectionTabs from '@/components/home/SectionTabs'
import FeaturedCards from '@/components/home/FeaturedCards'
import ZmanimStrip from '@/components/home/ZmanimStrip'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useIsMobile } from '@/lib/useIsMobile'
import { pickFeaturedCards } from '@/lib/featuredCards'
import { community } from '@/community.config'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/app/page'
import { useSiteSettings } from '@/lib/useSiteSettings'

type Props = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  /** Desktop only — opens the All Categories page, optionally scrolled to one
   *  section (passed when a section tab was clicked). */
  onViewAllCategories: (section?: string) => void
  /** The visitor's location (from the header pill) — lets "Places" results show
   *  distance, exactly like the category directory does. */
  coords: { lat: number; lng: number } | null
  /** The site-wide live GPS watch (see useLiveLocation) — passed through to the
   *  embedded home-screen map so its tracking controls act on the same shared
   *  watch as the full map page and the header pill. */
  liveTracking: { tracking: boolean; error: string | null; start: () => void; stop: () => void }
  /** 'map' when the visitor arrived by collapsing the fullscreen map — scrolls
   *  the embedded map band into view so the collapse reads as zooming out of
   *  the map rather than being dropped at the top of an unrelated page.
   *  Desktop only in practice; mobile's home screen has no map band. */
  scrollTo?: 'map' | null
}

// ── The home screen ───────────────────────────────────────────────────────────
// Desktop and mobile deliberately differ here (see the desktop-redesign notes):
//
//   Desktop — a short gateway: section tabs → hero + search → "Popular right
//   now" (three featured cards) → "Explore the map" → Zmanim & Shabbos →
//   footer, each labeled so the page reads as distinct sections rather than
//   one long blur. The full card index lives on its own page (AllCategories),
//   reachable from the tabs or the "Browse all categories" button.
//
//   Mobile — unchanged: hero + search, then the full grouped card grid inline,
//   no map (it has its own tab for that). A phone has no tab bar to reach an
//   All Categories page from, and its screen is a practical tool rather than a
//   gateway, so the grid stays where it is.
//
// Typing filters the grid live against each card's hidden keywords (so "shul"
// surfaces Synagogues). On desktop, where the grid isn't on screen, typing
// reveals it inline as a results list — a search that appeared to do nothing
// would be worse than a slightly longer page.
export default function Landing({ onNavigate, onOpenFlow, onViewAllCategories, coords, liveTracking, scrollTo }: Props) {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  const mapBandRef = useRef<HTMLDivElement>(null)
  const settings = useSiteSettings()
  const entryCards = useEntryCards(onOpenFlow)
  const isMobile = useIsMobile()
  // The Map pseudo-category still gates whether the map shows at all.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')

  const resources = resourceCards(onNavigate, categories)
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
  const openPlace = (hit: (typeof placeHits)[number]) =>
    onNavigate('patient', 'find', {
      findView: hit.item.category,
      findQuery: hit.term,
      findItemId: hit.item.id,
    })

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

  // The card grid shows inline on mobile always, and on desktop only as search
  // results (see the component note above).
  const showInlineGrid = isMobile || !!q

  // Jump to the map band when arriving from a collapsed fullscreen map. Waits
  // for the band to actually exist — on the first paint after navigating home
  // it may not be rendered yet (categories still loading, so `hasMap` is false).
  useEffect(() => {
    if (scrollTo !== 'map') return
    const el = mapBandRef.current
    if (!el) return
    el.scrollIntoView({ block: 'start' })
  }, [scrollTo, hasMap])

  return (
    <>
      {/* ── Section tabs (desktop) — the primary way to reach a category now
              that the grid lives on its own page. Full-bleed so the bar spans
              the window while its contents stay aligned to the page. ─────── */}
      <SectionTabs
        sections={navSections}
        listings={listings}
        onOpenCard={(card) => card.go()}
        onOpenSection={(title) => onViewAllCategories(title)}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* ── Heading + filter ───────────────────────────────────────────────── */}
        <HeroHeading settings={settings} query={query} onQueryChange={setQuery} />

        {/* ── The three featured cards (desktop) — between the search box and
                the map. Hidden while searching, when the grid below takes
                over as the answer to what was typed. ───────────────────────── */}
        {!isMobile && !q && (
          <FeaturedCards cards={featured} loading={loading} onShowAll={() => onViewAllCategories()} />
        )}

        {/* ── The map — the real full map screen, right on the home screen.
                Desktop only: mobile reaches the same map via its own tab bar
                entry, so it's dropped from this scroll to avoid showing it
                twice. Hidden while searching so results aren't pushed below
                a full-height map. `scroll-mt` clears the sticky site header, so
                scrolling this band into view (arriving from a collapsed
                fullscreen map) doesn't tuck its heading underneath it. ─────── */}
        {hasMap && !q && (
          <div ref={mapBandRef} className="mt-14 hidden scroll-mt-20 sm:block">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Explore the map</h2>
            <HomeMap onNavigate={onNavigate} coords={coords} liveTracking={liveTracking} />
          </div>
        )}

        {/* ── The grid — grouped into labeled sections; a search narrows each
                section's cards and hides any section left empty. ──────────── */}
        {showInlineGrid && (
          <section className="mt-12 sm:mt-14 space-y-10">
            {q && (filtered?.length ?? 0) === 0 && placeHits.length === 0 && (
              <p className="text-center text-sm text-slate-500">
                Nothing matches “{q}”. Try a different word or clear the filter.
              </p>
            )}
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
          </section>
        )}

        {/* ── Matching places (individual listings within the cards) ─────────── */}
        {placeHits.length > 0 && (
          <PlacesResults hits={placeHits} onOpen={openPlace} />
        )}
      </main>

      {/* ── Zmanim & Shabbos (desktop) — the full card's content (not a
              trimmed preview), rendered loose as a full-bleed band matching
              the footer right below it rather than another boxed card in the
              stack above. A sibling of <main>, not inside it, so its
              background can run edge to edge. Falls back to the community
              center so it renders something real before the visitor has set
              an address. ──────────────────────────────────────────────────── */}
      {!isMobile && !q && zmanimCategory && (
        <ZmanimStrip
          coords={coords ?? community.mapCenter}
          locationLabel={settings.name}
          title={zmanimCategory.pluralLabel}
          onOpenZmanim={() => onNavigate('patient', 'find', { findView: 'zmanim' })}
        />
      )}
    </>
  )
}
