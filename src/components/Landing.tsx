'use client'

import { useRef, useState } from 'react'
import { CardGrid, PlacesResults, cardMatches, searchListings, groupCardsIntoSections, resourceCards, useEntryCards, type CardDef, MAP_ACCENT_TINTS } from '@/components/home/sections'
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
  // Category" list above is dropped from the grid below (it'd just be a
  // duplicate tile) — what's left (Support/Volunteer/custom forms, plus any
  // category that isn't on the map, e.g. WhatsApp) goes into one "Get
  // Involved" section instead of the admin's multi-section grouping. Zmanim
  // is dropped from the grid entirely too — it has its own live widget at the
  // bottom of the page instead of a plain tile (see ZmanimWidget below).
  // Mobile has no map to be redundant with, so it keeps the original combined
  // grid (`allCards`/`filtered`/`sections`) untouched, Zmanim/Eruv tiles
  // included. resourceCards() gives 'medical'/'eruv' fixed ids (not the DB
  // category slug) for those two, so the id mapping below matches that.
  const onMapCardIds = new Set(
    categoriesOnMap.map((c) => (c.kind === 'medical' ? 'medical' : c.kind === 'eruv' ? 'eruv' : c.id)),
  )
  const offMapResources = resources?.filter((card) => !card.id || (!onMapCardIds.has(card.id) && card.id !== 'zmanim')) ?? []
  // Not tied to any real category/form yet — placeholder tiles until there's
  // somewhere for them to go.
  const placeholderCards: CardDef[] = [
    {
      title: 'Events and Involvement Opportunities',
      id: 'events-and-involvement-opportunities',
      icon: '🤝',
      keywords: ['volunteer', 'volunteering', 'community events', 'get involved'],
      go: () => {},
    },
    {
      title: 'Shul Involvement',
      id: 'shul-involvement',
      icon: '🕍',
      keywords: ['synagogue involvement', 'shul committee', 'membership'],
      go: () => {},
    },
  ]
  const desktopAllCards = resources ? [...entryCards, ...offMapResources, ...placeholderCards] : null
  const zmanimCategory = categories?.find((c) => c.kind === 'zmanim')

  const q = query.trim()
  const loading = !q && allCards === null
  const filtered = q && allCards ? allCards.filter((c) => cardMatches(c, q)) : allCards
  const desktopLoading = !q && desktopAllCards === null
  const desktopFiltered = q && desktopAllCards ? desktopAllCards.filter((c) => cardMatches(c, q)) : desktopAllCards

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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
      {/* ── Splashy site banner — logo + name + tagline, large and centered.
              Desktop only: mobile keeps its existing compact top, untouched. ── */}
      <section className="hidden sm:block pt-10 text-center">
        <h1 className="text-6xl lg:text-7xl font-extrabold tracking-tighter text-slate-900">
          {settings.name}
        </h1>
        <p className="mt-2 text-lg text-slate-500">{settings.tagline}</p>
      </section>

      {/* ── Heading + filter ─────────────────────────────────────────────────── */}
      <HeroHeading settings={settings} query={query} onQueryChange={setQuery} />

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
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#ffc145] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[#ffc145]/10 cursor-pointer"
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
      {hasMap && (
        <div ref={mapSectionRef} className="mt-8 hidden sm:block scroll-mt-24">
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

      {/* ── Desktop: "Get Connected" — whatever's left once the map above
              already covers a category (Support/Volunteer/custom forms, plus
              any category not on the map, e.g. WhatsApp/Eruv/Zmanim). Visually
              set apart from the plain page background (tinted, bordered) so it
              reads as its own distinct section. ─────────────────────────── */}
      <section className="mt-8 hidden sm:block sm:rounded-3xl sm:border-2 sm:border-[#df4c73] sm:bg-[#437fc7] sm:px-6 sm:py-10">
        {q && (desktopFiltered?.length ?? 0) === 0 && placeHits.length === 0 && hiddenFeatureMatches.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Nothing matches “{q}”. Try a different word or clear the filter.
          </p>
        )}
        {desktopLoading ? (
          <CardGrid cards={entryCards} loadingCount={6} />
        ) : (
          (desktopFiltered?.length ?? 0) > 0 && (
            <div>
              <h2 className="mb-6 text-center text-3xl font-extrabold uppercase tracking-wide text-slate-900">
                Get Connected
              </h2>
              <CardGrid cards={desktopFiltered!} tints={MAP_ACCENT_TINTS} oneRow />
            </div>
          )
        )}
      </section>

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
              only: mobile keeps its Zmanim tile in the combined grid. ────── */}
      <div ref={zmanimSectionRef} className="mt-8 hidden sm:block scroll-mt-24">
        <ZmanimWidget coords={coords} locationLabel="Your location" title={zmanimCategory?.pluralLabel} />
      </div>
    </main>
  )
}
