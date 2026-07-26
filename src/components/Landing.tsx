'use client'

import { useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards, type CardDef } from '@/components/home/sections'
import HeroHeading from '@/components/home/HeroHeading'
import HomeMap from '@/components/home/HomeMap'
import CategoryList from '@/components/home/CategoryList'
import ZmanimWidget from '@/components/home/ZmanimWidget'
import { HOSPITALS_ID, HOSPITAL_COLOR, colorForListingCategory, rankMapId } from '@/components/map/ResourceMapView'
import { useLogSearchMiss } from '@/lib/useLogSearchMiss'
import { useCategories } from '@/lib/useCategories'
import { useHomeSections } from '@/lib/useHomeSections'
import { useAllListings } from '@/lib/useAllListings'
import { useHospitals } from '@/lib/useHospitals'
import type { NavigateFn } from '@/types'
import type { Flow } from '@/app/page'
import { useSiteSettings } from '@/lib/useSiteSettings'
import type { CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'

type Props = {
  onNavigate: NavigateFn
  /** Opens a full-screen guided form (Support / Volunteer). */
  onOpenFlow: (kind: Flow['kind'], preselect?: string[]) => void
  /** The visitor's location (from the header pill) — lets "Places" results show
   *  distance, exactly like the category directory does. */
  coords: { lat: number; lng: number } | null
}

// Fixed display order for the map's "Browse by Category" list — the exact
// same order (and rank function) the map's own bottom key bar sorts by, so
// the two never drift apart. Medical/Eruv are singleton kinds without a
// stable, meaningful id to key on the same way listing categories are, so
// they're matched by kind instead (medical -> HOSPITALS_ID, same id the key
// bar and map pins use for hospitals).
function mapListRank(c: CategoryConfig): number {
  const key = c.kind === 'medical' ? HOSPITALS_ID : c.kind === 'eruv' ? 'eruv' : c.id
  return rankMapId(key)
}

// The whole site is one screen: a filter box, then a grid of cards. Typing
// filters the grid live against each card's hidden keywords (so "shul" surfaces
// Synagogues), with no dropdown to click through.
export default function Landing({ onNavigate, onOpenFlow, coords }: Props) {
  const categories = useCategories()
  const homeSections = useHomeSections()
  const listings = useAllListings()
  const [query, setQuery] = useState('')
  const settings = useSiteSettings()
  const entryCards = useEntryCards(onOpenFlow)
  // The Map pseudo-category still gates whether the map shows at all —
  // experimenting with rendering it directly on the home screen (below)
  // instead of behind a button; still just as easy to turn back into a card
  // or a button later if this doesn't stick.
  const hasMap = !!categories?.some((c) => c.kind === 'map')
  const hospitals = useHospitals()

  // Shown as a "Browse by Category" list beside the map: Medical (hospital
  // pins) once there's at least one hospital, a listing category with at
  // least one geocoded point, or Eruv (which has no pins of its own — its row
  // just shows its static status info and doesn't affect the map, which is
  // fine). Expanding a row (or tapping a facility inside it) isolates and
  // zooms the map to match, via `focusedListingId` below — except Eruv, which
  // has nothing to isolate.
  const categoriesOnMap = (categories ?? [])
    .filter((c) =>
      c.kind === 'medical'
        ? (hospitals ?? []).length > 0
        : c.kind === 'eruv'
          ? true
          : c.kind === 'listing' && (listings ?? []).some((item) => item.category === c.id && item.geo?.lat != null && item.geo?.lng != null),
    )
    .sort((a, b) => mapListRank(a) - mapListRank(b))

  // Isolating a single facility or a whole category on the map — layered, not
  // exclusive: a facility can only be tapped from inside its (already
  // expanded/isolated) category row, so focusing one doesn't touch which
  // categories are isolated — collapsing one (or expanding another) does,
  // since whatever facility was showing is no longer visible either way.
  // ResourceMapView itself prioritizes the single facility over whichever
  // categories are isolated whenever both are set. Multiple categories can be
  // expanded — and isolated together on the map — at once.
  const [focusedListingId, setFocusedListingId] = useState<string | null>(null)
  const [focusedCategoryIds, setFocusedCategoryIds] = useState<Set<string>>(new Set())
  // The exact ids currently surviving each expanded category row's own
  // filters (search/open-now/kosher/etc.), keyed by that category's map id —
  // no entry yet until that row reports its first batch, in which case the
  // map falls back to the whole category meanwhile.
  const [categoryItemIdsByCategory, setCategoryItemIdsByCategory] = useState<Record<string, string[]>>({})
  // Toggles one category's membership in the isolated set (add if absent,
  // remove if present) — this is what expanding/collapsing a row calls.
  const toggleCategory = (id: string) => {
    setFocusedListingId(null)
    setFocusedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setCategoryItemIdsByCategory((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // Scroll targets for the search box's "jump to" results below — a category
  // match scrolls to + isolates its row in the map's "Browse by Category"
  // list; a Zmanim match scrolls to the widget at the bottom of the page.
  const mapSectionRef = useRef<HTMLDivElement>(null)
  const zmanimSectionRef = useRef<HTMLDivElement>(null)
  // Mirrors CategoryList's own mapIdFor — the map's Medical row is keyed by
  // HOSPITALS_ID rather than the category's own db id, same as its pins.
  const mapIdForCategoryConfig = (c: CategoryConfig): string => (c.kind === 'medical' ? HOSPITALS_ID : c.id)
  const jumpToMapCategory = (cardId: string) => {
    const found = categoriesOnMap.find((c) => (c.kind === 'medical' ? 'medical' : c.kind === 'eruv' ? 'eruv' : c.id) === cardId)
    if (!found) return
    const mapId = mapIdForCategoryConfig(found)
    // Only turn it on — a "jump to" result shouldn't toggle an already-open
    // category back off.
    if (!focusedCategoryIds.has(mapId)) toggleCategory(mapId)
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const jumpToZmanim = () => {
    zmanimSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Same color assignment ResourceMapView uses for pins/chips — shared via
  // colorForListingCategory so the two can never drift apart; hospitals get
  // their own fixed color instead of a palette slot, same as their pins.
  const colorFor = (mapId: string): string => {
    if (mapId === HOSPITALS_ID) return HOSPITAL_COLOR
    return colorForListingCategory(categories ?? [], mapId)
  }

  const resources = resourceCards(onNavigate, categories)
  // Order is no longer alphabetical — groupCardsIntoSections (below) sorts these
  // into the admin-configured labeled groups for the grid.
  const allCards = resources ? [...entryCards, ...resources] : null

  // Desktop only: any category already shown in the map + "Browse by
  // Category" list above is excluded from the "jump to" results below (it'd
  // just be a duplicate of what expanding that row already does). Mobile has
  // no map to be redundant with, so it keeps the original combined grid
  // (`allCards`/`filtered`/`sections`) untouched, Zmanim/Eruv tiles included.
  // resourceCards() gives 'medical'/'eruv' fixed ids (not the DB category
  // slug) for those two, so the id mapping below matches that.
  const onMapCardIds = new Set(
    categoriesOnMap.map((c) => (c.kind === 'medical' ? 'medical' : c.kind === 'eruv' ? 'eruv' : c.id)),
  )
  // Desktop-only fixed "quick links" row, shown inside the hero band between
  // the mission text and the search box (see HeroHeading's `quickLinks`
  // prop) — a small fixed set in a fixed order, NOT the dynamic
  // search-filtered grid the old "Get Connected" section used to be (that
  // whole section/band was removed). Support/Volunteer are the same cards
  // `entryCards` builds (same `go`/icon), just relabeled for this row;
  // WhatsApp reuses its normal category card unchanged. Any card not found
  // yet (e.g. `resources` still loading) is simply omitted until it is.
  const quickLinksCards: CardDef[] = (() => {
    const volunteer = entryCards.find((c) => c.id === 'volunteer')
    const support = entryCards.find((c) => c.id === 'support')
    const whatsapp = resources?.find((c) => c.id === 'whatsapp')
    return [
      volunteer && { ...volunteer, title: 'Volunteer' },
      support && { ...support, title: 'Support' },
      { title: 'Young Professionals', id: 'young-professional-groups', icon: '🤝', go: () => {} },
      whatsapp,
    ].filter((c): c is CardDef => !!c)
  })()
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')

  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards

  // Individual places that match the query by name + tags (e.g. a grocery store
  // with a "cheese" tag for "kosher cheese"). Only computed once the visitor types.
  const placeHits = q && listings ? searchListings(listings, categories ?? [], q, coords) : []

  // Desktop only: categories/Zmanim that used to be plain tiles (searchable via
  // resourceCards' own rich keywords, e.g. "shul" -> Synagogues) now live in the
  // map list or the widget below instead of the grid — so a match here surfaces
  // as a "jump to" result rather than a tile, using the exact same keywords.
  const hiddenFeatureMatches = q && resources
    ? resources.filter((card) => card.id != null && (onMapCardIds.has(card.id) || card.id === 'zmanim') && cardMatches(card, q))
    : []

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

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-0">
      {/* ── Condensed top bar — site name + tagline + search box (top-left,
              no longer large/centered — the search box moved here from the
              old "What are you looking for?" band below, which is now
              desktop-hidden entirely, see HeroHeading.tsx) and the "Get
              Connected" quick-links (Volunteer Opportunities / Support /
              Young Professional Groups / WhatsApp Groups — fixed set, fixed
              order) as bordered buttons to the right, all in one row.
              Desktop only: mobile keeps its existing compact top (with its
              own separate title/search in HeroHeading), untouched. Full-bleed
              band (same breakout as the sections below it) — see
              [[project_art_deco_home_redesign]]. */}
      <section className="hidden sm:flex sm:items-center sm:justify-between sm:gap-6 sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#0C3D57] sm:px-6 sm:py-6">
        <div className="text-left">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#fefefe]">
            {settings.name}
          </h1>
          {/* Fixed copy per explicit request, not `settings.tagline` — this
                  exact sentence replaces whatever the admin-configured tagline
                  would otherwise show here. */}
          <p className="text-xs text-[#fefefe]">
            Community resources for residents, visitors, and hospital patients
          </p>
        </div>
        {(quickLinksCards.length > 0 || ui.search.landing) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {quickLinksCards.map((c) => (
              <button
                key={c.id ?? c.title}
                onClick={c.go}
                className="whitespace-nowrap rounded-full border-2 border-[#E1E4E5] bg-white px-3 py-1.5 text-xs font-semibold text-[#393535] transition-colors hover:bg-[#700F0F] hover:text-[#fefefe] cursor-pointer"
              >
                {c.title}
              </button>
            ))}
            {ui.search.landing && (
              <div className="w-56">
                <div className="flex items-center rounded-full border-2 border-[#E1E4E5] bg-white pl-4 pr-1.5 py-1.5 shadow-sm transition-shadow focus-within:shadow-md">
                  <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter — kosher food, rides, housing, synagogues…"
                    aria-label="Filter resources"
                    className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      aria-label="Clear filter"
                      className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Mobile-only now: "What are you looking for?" heading + filter —
              desktop hides this whole band since its title was removed and
              its search box moved into the condensed bar above. ─────────── */}
      <HeroHeading
        settings={settings}
        query={query}
        onQueryChange={setQuery}
      />

      {/* ── Desktop: "jump to" results — categories/Zmanim that match the search
              box's query but no longer have a tile of their own (they moved into
              the map list or the widget below), so this is how the search box
              still reaches them. ──────────────────────────────────────────── */}
      {hiddenFeatureMatches.length > 0 && (
        <div className="mt-6 hidden sm:flex flex-wrap gap-2">
          {hiddenFeatureMatches.map((card) => (
            <button
              key={card.id}
              onClick={() => (card.id === 'zmanim' ? jumpToZmanim() : jumpToMapCategory(card.id!))}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#ffc145] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[#ffc145] cursor-pointer"
            >
              {card.icon && <span aria-hidden="true">{card.icon}</span>}
              {card.title}
              <span aria-hidden="true" className="text-slate-400">↓</span>
            </button>
          ))}
        </div>
      )}

      {/* ── The map — the real full map screen, right on the home screen, with
              a "Browse by Category" list beside it. Desktop only: mobile now
              reaches the same map via its own tab bar entry, so it's dropped
              from this scroll to avoid showing it twice. ─────────────────── */}
      {/* Full-bleed white band (same `w-screen` + `margin-left: calc(50% -
              50vw)` breakout as the hero above) — the map itself now goes
              edge-to-edge with it too (no inner max-w-6xl wrapper, no
              horizontal padding), rather than staying pinned to the page's
              normal content column inside the color band. Its own border was
              dropped to match (see ResourceMapView.tsx) — a border would just
              look clipped at the browser's edge. ─────────────────────────── */}
      {hasMap && (
        <div ref={mapSectionRef} className="hidden sm:block scroll-mt-24 sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#393535]">
          <HomeMap
            onNavigate={onNavigate}
            coords={coords}
            focusedListingId={focusedListingId}
            onFocusListingChange={setFocusedListingId}
            focusedCategoryIds={focusedCategoryIds}
            onFocusCategoryChange={toggleCategory}
            categoryItemIdsByCategory={categoryItemIdsByCategory}
            sidebar={
              categoriesOnMap.length > 0 && listings ? (
                <CategoryList
                  categories={categoriesOnMap}
                  listings={listings}
                  hospitals={hospitals ?? []}
                  onNavigate={onNavigate}
                  coords={coords}
                  onFocusListing={setFocusedListingId}
                  focusedListingId={focusedListingId}
                  focusedCategoryIds={focusedCategoryIds}
                  onFocusCategory={toggleCategory}
                  colorFor={colorFor}
                  onVisibleIdsChange={(mapId, ids) =>
                    setCategoryItemIdsByCategory((prev) => ({ ...prev, [mapId]: ids }))
                  }
                />
              ) : undefined
            }
          />
        </div>
      )}

      {/* ── Mobile: original combined grid, grouped into the admin's labeled
              sections — untouched, since mobile has no map to be redundant
              with. ──────────────────────────────────────────────────────── */}
      <section className="mt-12 space-y-10 sm:hidden">
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

      {/* ── Matching places (individual listings within the cards) ───────────── */}
      {placeHits.length > 0 && (
        <PlacesResults hits={placeHits} onOpen={openPlace} />
      )}

      {/* ── Zmanim widget — live candle-lighting/Havdalah times, replacing the
              plain Zmanim tile that used to sit in the grid above. Desktop
              only: mobile keeps its Zmanim tile in the combined grid. Same
              full-bleed white band treatment as the map section — no border,
              no gap before it (touches the Get Connected band directly above
              it) — but its content stays re-inset to the normal max-w-6xl
              column (like the hero/Get Connected bands), since a two-column
              list of zman times shouldn't stretch across the whole browser
              width the way the map benefits from. ─────────────────────── */}
      <div ref={zmanimSectionRef} className="hidden sm:block scroll-mt-24 sm:w-screen sm:ml-[calc(50%-50vw)] sm:bg-[#fefefe] sm:py-10">
        <div className="sm:mx-auto sm:max-w-6xl sm:px-6">
          <ZmanimWidget coords={coords} locationLabel="Your location" title={zmanimCategory?.pluralLabel} />
        </div>
      </div>
    </main>
  )
}
