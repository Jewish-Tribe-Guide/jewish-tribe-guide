'use client'

import { useState } from 'react'
import type { CategoryConfig } from '@/lib/categories'
import type { HomeSection } from '@/lib/homeSections'
import type { DirectoryResource, NavigateFn } from '@/types'
import { listingSearchText } from '@/lib/searchListing'
import { distanceMiles } from '@/lib/geo'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { useForm, useForms } from '@/lib/useForms'
import { community } from '@/community.config'

export type CardDef = {
  title: string
  go: () => void
  /** Hidden search terms — the words people type that should surface this card
   *  (e.g. "shul" for Synagogues, "supermarket" for Grocery Stores). */
  keywords?: string[]
  /** One emoji shown above the title — from the category's own `icon` field
   *  where there is one; a few hand-built cards set a fixed one directly. */
  icon?: string
  /** Stable id (category id, or a fixed one for hand-built cards like 'map',
   *  'support') — used to sort cards into home-screen sections; title alone
   *  would break grouping if a label gets renamed. */
  id?: string
  /** A photo for the tile's background instead of the flat tint — set via the
   *  category editor. Unset/null falls back to the tint + icon look. */
  cardImageUrl?: string | null
  /** Title text color over `cardImageUrl` (defaults to white — a photo gets a
   *  dark scrim underneath regardless, but the color is still admin-editable
   *  for photos where white doesn't read well). Ignored without an image, and
   *  doesn't affect the icon — that always renders as a white silhouette. */
  cardTextColor?: string | null
}

// Soft tile tints, cycled per card across the grid.
export const TINTS = ['bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50', 'bg-indigo-50']

export function Card({ card, tint }: { card: CardDef; tint: string }) {
  const hasImage = !!card.cardImageUrl
  const textColor = card.cardTextColor || '#ffffff'
  return (
    <button onClick={card.go} className="group w-full cursor-pointer">
      <div
        className={`relative aspect-[4/3] rounded-2xl overflow-hidden ${hasImage ? '' : tint} ring-1 ring-slate-900/5 flex flex-col items-center justify-center gap-1 p-4 text-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-slate-900/10 group-hover:-translate-y-0.5 group-active:scale-[0.97] group-active:shadow-lg group-active:shadow-slate-900/10`}
        style={hasImage ? { backgroundImage: `url(${card.cardImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {/* A photo card gets a dark scrim regardless of the photo's own
            brightness, so the title/icon stay legible no matter what's
            pasted in — same idea as the cRc-style reference. */}
        {hasImage && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden="true" />}
        {card.icon && (
          <span
            className={`relative text-3xl leading-none ${hasImage ? 'drop-shadow' : ''}`}
            // Photo cards render the icon as a flat white silhouette (like the
            // cRc reference) instead of the emoji's own colors — emoji are
            // color glyphs, not strokable outlines, so this is a filter over
            // the rendered glyph rather than a true hollow-line icon. The
            // title's own color is still admin-set via `textColor` below.
            style={hasImage ? { filter: 'brightness(0) invert(1)' } : undefined}
            aria-hidden="true"
          >
            {card.icon}
          </span>
        )}
        <span
          className={`relative text-[17px] font-semibold leading-snug transition-colors ${
            hasImage ? 'drop-shadow' : 'text-slate-900 group-hover:text-primary group-active:text-primary'
          }`}
          style={hasImage ? { color: textColor } : undefined}
        >
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
        <Card key={card.id ?? card.title} card={card} tint={TINTS[i % TINTS.length]} />
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

// ── Home-screen sections ──────────────────────────────────────────────────────
// The grouping shown on the home page — admin-editable (title + which cards, in
// what order) via the Sections tab in /admin; see src/lib/homeSections.ts and
// useHomeSections.ts. A card not listed in any section (a category with no
// assigned home yet, or any future custom form) falls into a trailing "More"
// section instead of silently disappearing from the home screen.

export type CardSectionDef = { title: string; cards: CardDef[] }

/** Sorts cards into the given sections (in each section's own listed order),
 *  then a trailing untitled "More" section for anything left over — never
 *  drops a card just because it has no assigned section. */
export function groupCardsIntoSections(cards: CardDef[], sections: HomeSection[]): CardSectionDef[] {
  const byId = new Map(cards.filter((c) => c.id).map((c) => [c.id as string, c]))
  const used = new Set<string>()

  const grouped = sections
    .map(({ title, cardIds }) => {
      const sectionCards = cardIds.map((id) => byId.get(id)).filter((c): c is CardDef => !!c)
      sectionCards.forEach((c) => used.add(c.id as string))
      return { title, cards: sectionCards }
    })
    .filter((s) => s.cards.length > 0)

  const leftover = cards.filter((c) => !(c.id && used.has(c.id)))
  if (leftover.length > 0) grouped.push({ title: 'More', cards: leftover })

  return grouped
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
    // address-anchored categories only, when the listing has coordinates.
    const withDistance =
      coords && category.hasAddress !== false && item.geo
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

/** The "Places" results list: each hit rendered as the same card its category
 *  directory uses, so a searched place is the full listing (davening times,
 *  upvotes, filters, and all). */
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
        {hits.map((hit) => (
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
        ))}
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
): CardDef[] | null {
  if (categories === null) return null

  const medical = categories.find((c) => c.kind === 'medical')
  const zmanim = categories.find((c) => c.kind === 'zmanim')
  const eruv = categories.find((c) => c.kind === 'eruv')

  return [
    ...(medical
      ? [{
          title: medical.pluralLabel,
          id: 'medical',
          icon: medical.icon,
          cardImageUrl: medical.cardImageUrl,
          cardTextColor: medical.cardTextColor,
          keywords: [
            'hospital', 'hospitals', 'about your hospital', 'chaplain', 'rabbi', 'prayer room',
            'prayer space', 'shabbat elevator', 'shabbos elevator', 'kosher cafeteria',
            'jewish doctor', 'medical staff', 'bikur cholim room', 'shabbos accommodations',
            'hup', 'penn', 'university of pennsylvania', 'jefferson', 'chop', 'childrens hospital',
            'temple', 'einstein',
          ],
          go: () => nav('patient', 'find', { findView: 'hospitals' }),
        }]
      : []),
    ...categories.filter((c) => c.kind === 'listing').map((c) => ({
      title: c.pluralLabel,
      id: c.id,
      icon: c.icon,
      cardImageUrl: c.cardImageUrl,
      cardTextColor: c.cardTextColor,
      keywords: [...new Set([...labelWords(c), ...(CATEGORY_KEYWORDS[c.id] ?? []), c.id.replaceAll('-', ' ')])],
      go: () => nav('patient', 'find', { findView: c.id }),
    })),
    ...(zmanim
      ? [{
          title: zmanim.pluralLabel,
          id: 'zmanim',
          icon: zmanim.icon,
          cardImageUrl: zmanim.cardImageUrl,
          cardTextColor: zmanim.cardTextColor,
          keywords: [
            'zmanim', 'zman', 'candle lighting', 'candles', 'havdalah', 'shabbat times', 'shabbos',
            'shabbat', 'sunset', 'sunrise', 'shkia', 'netz', 'hebrew date', 'davening times', 'shema',
            'mincha', 'maariv', 'shacharis', 'parsha', 'molad',
          ],
          go: () => nav('patient', 'find', { findView: 'zmanim' }),
        }]
      : []),
    ...(eruv
      ? [{
          title: eruv.pluralLabel,
          id: 'eruv',
          icon: eruv.icon,
          cardImageUrl: eruv.cardImageUrl,
          cardTextColor: eruv.cardTextColor,
          keywords: [
            'eruv', 'carry', 'carrying', 'eruv map', 'eruv status', 'eruv hotline', 'shabbat boundary',
            'techum', 'stroller on shabbos',
          ],
          go: () => nav('patient', 'find', { findView: 'eruv' }),
        }]
      : []),
  ]
}

/** The hand-built cards at the front of the grid — Patient & Family Support,
 *  Volunteer, View Map, and every admin-created custom form. Shared by the
 *  live home page (Landing.tsx) and the admin Home page preview, so the two
 *  never drift apart. */
export function useEntryCards(
  categories: CategoryConfig[] | null,
  onNavigate: NavigateFn,
  onOpenFlow: (kind: string, preselect?: string[]) => void,
): CardDef[] {
  const supportForm = useForm('support')
  const volunteerForm = useForm('volunteer')
  // Every other form is an admin-created custom one — support/volunteer keep
  // their own dedicated cards below (fixed copy/keywords), so exclude them
  // here rather than double-listing.
  const customForms = (useForms() ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')
  const mapCategory = categories?.find((c) => c.kind === 'map')

  return [
    ...(community.features.patientSupport
      ? [{
          title: supportForm?.title ?? 'Patient & Family Support',
          id: 'support',
          icon: supportForm?.icon || '🤝',
          cardImageUrl: supportForm?.cardImageUrl,
          cardTextColor: supportForm?.cardTextColor,
          keywords: [
            'request support', 'support', 'help', 'assistance', 'request', 'patient', 'patients',
            'family', 'families', 'need help', 'meal', 'meals', 'food', 'kosher food', 'dinner',
            'lunch', 'breakfast', 'shabbos food', 'ride', 'rides', 'car', 'drive', 'lift', 'transport',
            'transportation', 'taxi', 'uber', 'pickup', 'appointment', 'housing', 'place to stay',
            'room', 'apartment', 'lodging', 'overnight', 'out of town', 'visit', 'visitor', 'visitors',
            'bikur cholim', 'company', 'someone to talk to', 'case manager', 'social worker',
          ],
          go: () => onOpenFlow('support'),
        }]
      : []),
    ...(community.features.volunteer
      ? [{
          title: volunteerForm?.title ?? 'Volunteer for Patients',
          id: 'volunteer',
          icon: volunteerForm?.icon || '💛',
          cardImageUrl: volunteerForm?.cardImageUrl,
          cardTextColor: volunteerForm?.cardTextColor,
          keywords: [
            'volunteer', 'volunteering', 'help out', 'give', 'give back', 'chesed', 'mitzvah', 'cook',
            'cook for a family', 'deliver meals', 'host', 'hosting', 'drive', 'rides', 'give rides',
            'visit patients', 'donate time', 'sign up', 'get involved', 'tzedakah', 'lend a hand',
          ],
          go: () => onOpenFlow('volunteer'),
        }]
      : []),
    ...(mapCategory
      ? [{
          title: 'View Map',
          id: 'map',
          icon: mapCategory.icon,
          keywords: [
            'map', 'maps', 'view map', 'locations', 'where', 'nearby', 'directions', 'address',
            'addresses', 'google map', 'pin', 'pins', 'navigate', 'around me',
          ],
          go: () => onNavigate('patient', 'map'),
        }]
      : []),
    ...customForms.map((f) => ({
      title: f.title,
      id: f.id,
      icon: f.icon,
      cardImageUrl: f.cardImageUrl,
      cardTextColor: f.cardTextColor,
      go: () => onOpenFlow(f.id),
    })),
  ]
}
