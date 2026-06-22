'use client'

import { useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource, NavigateFn } from '@/types'
import { listingSearchText } from '@/lib/searchListing'
import { distanceMiles } from '@/lib/geo'
import { GenericListingCard } from '@/components/resources/GenericDirectory'
import SynagogueCard from '@/components/SynagogueCard'

export type CardDef = {
  title: string
  go: () => void
  /** Hidden search terms — the words people type that should surface this card
   *  (e.g. "shul" for Synagogues, "supermarket" for Grocery Stores). */
  keywords?: string[]
  /** Renders as the dashed "suggest a category" affordance instead of a tile. */
  dashed?: boolean
}

// Soft tile tints, cycled per card across the grid.
export const TINTS = ['bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50', 'bg-indigo-50']

export function Card({ card, tint }: { card: CardDef; tint: string }) {
  if (card.dashed) {
    return (
      <button onClick={card.go} className="group w-full cursor-pointer">
        <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-1.5 p-4 text-center transition-all duration-200 group-hover:border-primary group-hover:bg-primary/10 group-active:border-primary group-active:bg-primary/10">
          <span className="text-2xl leading-none text-primary" aria-hidden="true">＋</span>
          <span className="text-[15px] font-semibold leading-snug text-primary">{card.title}</span>
        </div>
      </button>
    )
  }
  return (
    <button onClick={card.go} className="group w-full cursor-pointer">
      <div
        className={`aspect-[4/3] rounded-2xl ${tint} ring-1 ring-slate-900/5 flex items-center justify-center p-4 text-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-slate-900/10 group-hover:-translate-y-0.5 group-active:scale-[0.97] group-active:shadow-lg group-active:shadow-slate-900/10`}
      >
        <span className="text-[17px] font-semibold leading-snug text-slate-900 group-hover:text-primary group-active:text-primary transition-colors">
          {card.title}
        </span>
      </div>
    </button>
  )
}

export function CardSkeleton() {
  return <div className="aspect-[4/3] rounded-2xl bg-slate-100 animate-pulse" />
}

/** The single-screen card grid. Renders every card, then `loadingCount`
 *  skeletons (for sections still loading, e.g. resource categories). Tints
 *  cycle across the whole grid so colors stay varied. */
export function CardGrid({
  cards,
  loadingCount = 0,
}: {
  cards: CardDef[]
  loadingCount?: number
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
      {cards.map((card, i) => (
        <Card key={card.title} card={card} tint={TINTS[i % TINTS.length]} />
      ))}
      {Array.from({ length: loadingCount }, (_, i) => (
        <CardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  )
}

/** Does a card match the typed query? Every word must appear in the title or a
 *  hidden keyword (AND across words). */
export function cardMatches(card: CardDef, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const hay = [card.title, ...(card.keywords ?? [])].join(' ').toLowerCase()
  return tokens.every((t) => hay.includes(t))
}

// ── Listing (within-card) search ───────────────────────────────────────────────

/** A single place that matched the landing search — e.g. a grocery store whose
 *  "cheese" tag matched "kosher cheese". */
export type ListingHit = {
  item: DirectoryResource
  /** Full category config — needed to render the real listing card. */
  category: CategoryConfig
  /** The category's plural label, e.g. "Grocery Stores". */
  categoryLabel: string
  /** Tags that matched the query — used to seed the category search on tap. */
  matchedTags: string[]
  /** The term to pre-fill the category's own search with on tap: the matched tag
   *  when there is one (so the place survives that page's filter), else the query. */
  term: string
}

// Collect every string-array value from a listing (tags, _sometimes, etc.) for
// matching and ranking. Stays decoupled from per-category field config.
function listingTags(item: DirectoryResource): string[] {
  const out: string[] = []
  for (const value of Object.values(item)) {
    if (Array.isArray(value) && value.every((x) => typeof x === 'string')) {
      out.push(...(value as string[]))
    }
  }
  return out
}

/** Find individual listings matching the query against their full search text —
 *  name, address, tags, and scalar detail fields (every query word must appear).
 *  Returns at most `limit` hits so a broad word like "kosher" can't flood the
 *  landing page. */
export function searchListings(
  listings: DirectoryResource[],
  categories: CategoryConfig[],
  query: string,
  coords: { lat: number; lng: number } | null = null,
  limit = 8,
): ListingHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const labelById = new Map(categories.map((c) => [c.id, c.pluralLabel]))
  const configById = new Map(categories.map((c) => [c.id, c]))

  // How many query words a tag contains — used to rank "Kosher Wine" (2) above
  // "Glatt Kosher Meat" (1) for the query "kosher wine".
  const score = (tag: string) => {
    const t = tag.toLowerCase()
    return tokens.reduce((n, tok) => n + (t.includes(tok) ? 1 : 0), 0)
  }

  const hits: ListingHit[] = []
  for (const item of listings) {
    const category = configById.get(item.category)
    if (!category) continue
    const tags = listingTags(item)
    const hay = listingSearchText(item, category)
    if (!tokens.every((t) => hay.includes(t))) continue
    const matchedTags = tags
      .filter((tag) => score(tag) > 0)
      .sort((a, b) => score(b) - score(a) || a.length - b.length)
      .slice(0, 3)
    // Stamp straight-line distance the same way the directory does (ResourceLoader):
    // address-anchored, non-community categories, when the listing has coordinates.
    const withDistance =
      coords && !category.community && item.geo
        ? { ...item, milesFromAddress: distanceMiles(coords, item.geo) }
        : item
    hits.push({
      item: withDistance,
      category,
      categoryLabel: labelById.get(item.category) ?? item.category,
      matchedTags,
      term: matchedTags[0] ?? query.trim(),
    })
    if (hits.length >= limit) break
  }
  return hits
}

/** The "Places" results list: each hit rendered as the SAME card its category
 *  directory uses — SynagogueCard for shuls (so davening times show), the generic
 *  collapsible card for everything else — so a searched place is the full listing. */
export function PlacesResults({
  hits,
  onOpen,
}: {
  hits: ListingHit[]
  onOpen: (hit: ListingHit) => void
}) {
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Places
      </h2>
      <div className="space-y-2">
        {hits.map((hit) =>
          hit.item.category === 'synagogue' ? (
            <SynagogueCard
              key={hit.item.id}
              item={hit.item}
              onEdit={() => onOpen(hit)}
              onReport={() => onOpen(hit)}
            />
          ) : (
            <GenericListingCard
              key={hit.item.id}
              item={hit.item}
              category={hit.category}
              upvotes={!!hit.category.upvotesEnabled}
              count={voteCounts[hit.item.id] ?? hit.item.upvotes ?? 0}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [hit.item.id]: c }))}
              onTagClick={(tag) => onOpen({ ...hit, term: tag })}
              onFilterOpen={() => onOpen(hit)}
              onFilterBool={() => onOpen(hit)}
              onFilterSelect={() => onOpen(hit)}
              onEdit={() => onOpen(hit)}
              onReport={() => onOpen(hit)}
            />
          ),
        )}
      </div>
    </section>
  )
}

// ── Card definitions ──────────────────────────────────────────────────────────

// Hidden synonyms for the well-known categories — the words people type that
// won't appear in a category's label or description. Keyed by category id.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  synagogue: ['shul', 'shuls', 'minyan', 'minyanim', 'davening', 'shtiebel', 'beis medrash'],
  mikvah: ['mikveh', 'mikvaos', 'immersion'],
  grocery: ['groceries', 'supermarket', 'market', 'food shopping'],
  restaurant: ['restaurants', 'dining', 'eat out', 'takeout', 'bakery', 'bakeries', 'cafe', 'cafes', 'coffee', 'ice cream', 'dessert', 'sweets', 'donuts', 'pastry', 'bagel'],
  hotel: ['hotels', 'motel', 'lodging', 'place to stay'],
  whatsapp: ['whatsapp', 'group chat', 'community group', 'chat'],
}

// Words pulled from a category's own label + description, so newly added
// categories are searchable without touching this file.
function labelWords(c: CategoryConfig): string[] {
  return `${c.pluralLabel} ${c.description}`
    .toLowerCase()
    .split(/[^a-z'’]+/)
    .filter((w) => w.length >= 3)
}

/** Resource cards: every live category (restaurants, groceries, hotels, …)
 *  plus the hand-curated pages. Returns null while categories are loading
 *  (show skeletons). */
export function resourceCards(
  nav: NavigateFn,
  categories: CategoryConfig[] | null,
  { includeHospital }: { includeHospital: boolean },
): CardDef[] | null {
  if (categories === null) return null

  return [
    ...(includeHospital
      ? [
          {
            title: 'Jewish Medical Resources',
            keywords: [
              'hospital', 'hospitals', 'about your hospital', 'chaplain', 'rabbi', 'prayer room',
              'prayer space', 'shabbat elevator', 'shabbos elevator', 'kosher cafeteria',
              'jewish doctor', 'medical staff', 'bikur cholim room', 'shabbos accommodations',
              'hup', 'penn', 'university of pennsylvania', 'jefferson', 'chop', 'childrens hospital',
              'temple', 'einstein',
            ],
            go: () => nav('patient', 'find', { findView: 'hospitals' }),
          },
        ]
      : []),
    ...categories.map((c) => ({
      title: c.pluralLabel,
      keywords: [...new Set([...labelWords(c), ...(CATEGORY_KEYWORDS[c.id] ?? []), c.id.replaceAll('-', ' ')])],
      go: () => nav('patient', 'find', { findView: c.id }),
    })),
    {
      title: 'Zmanim & Shabbos',
      keywords: [
        'zmanim', 'zman', 'candle lighting', 'candles', 'havdalah', 'shabbat times', 'shabbos',
        'shabbat', 'sunset', 'sunrise', 'shkia', 'netz', 'hebrew date', 'davening times', 'shema',
        'mincha', 'maariv', 'shacharis', 'parsha', 'molad',
      ],
      go: () => nav('patient', 'find', { findView: 'zmanim' }),
    },
    {
      title: 'Eruv Information',
      keywords: [
        'eruv', 'carry', 'carrying', 'eruv map', 'eruv status', 'eruv hotline', 'shabbat boundary',
        'techum', 'stroller on shabbos',
      ],
      go: () => nav('patient', 'find', { findView: 'eruv' }),
    },
  ]
}
