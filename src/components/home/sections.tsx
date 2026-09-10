'use client'

import { useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { CategoryConfig } from '@/lib/categories'
import type { HomeSection } from '@/lib/homeSections'
import type { DirectoryResource, NavigateFn } from '@/types'
import { isOptimizableImage } from '@/lib/imageHosts'
import { listingSearchText } from '@/lib/searchListing'
import { haversineMiles } from '@/lib/geo'
import { travelCompare } from '@/lib/listingTravel'
import { GenericListingCard } from '@/components/resources/GenericListingCard'
import { useForm, useForms } from '@/lib/useForms'
import { community } from '@/community.config'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import { CategoryGlyph } from '@/lib/categoryIcons'
import CategoryIcon from '@/components/CategoryIcon'
import { getCategoryColor } from '@/lib/categoryColor'
import { useIsMobile } from '@/lib/useIsMobile'

export type CardDef = {
  title: string
  go: () => void
  /** The same destination `go` navigates to, as a real path — lets `Card`
   *  render a genuine `<Link>` instead of a `<button onClick>`, which is
   *  what makes cmd/ctrl/middle-click "open in new tab" work at all; a
   *  click handler alone never gets that regardless of anything else in the
   *  app. `go` still does the actual navigating on a plain click (a real
   *  `<Link>` already knows to leave a modified click to the browser and
   *  only intercept a plain one), so this doesn't change what tapping the
   *  card does today — it only fixes what a modified click does. */
  href: string
  /** Hidden search terms — the words people type that should surface this card
   *  (e.g. "shul" for Synagogues, "supermarket" for Grocery Stores). */
  keywords?: string[]
  /** One emoji shown above the title — from the category's own `icon` field
   *  where there is one; a few hand-built cards set a fixed one directly.
   *  Ignored when `cardImageUrl` is set (see `Card`) — an emoji over a photo
   *  never reads as a clean icon, so those cards go title-only. */
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
  /** How much is behind this card, already worded — "22 places", "19 groups".
   *  Shown only by CompactCard (the flat browse index); the full photo tiles
   *  have a different job.
   *
   *  A pre-worded string rather than a number, because the right noun is the
   *  caller's to know: WhatsApp Groups are not "places", and the counted
   *  cards sit in the same array as ones that count nothing at all. Leave it
   *  undefined for those — see CompactCard on why "0 places" is worse than
   *  saying nothing. */
  count?: string
}

// Soft tile tints, cycled per card across the grid.
export const TINTS = ['bg-sky-50', 'bg-amber-50', 'bg-rose-50', 'bg-emerald-50', 'bg-indigo-50']

export function Card({
  card,
  tint,
  priority = false,
  onCardClick,
}: {
  card: CardDef
  tint: string
  priority?: boolean
  /** Fired on click, alongside the real navigation (not instead of it) —
   *  callers use this to tag which on-screen surface a card was opened
   *  from (e.g. the tab nav's mega-menu vs. the always-visible desktop
   *  grid — see CardGrid's own doc). Optional: most callers of Card don't
   *  need this, so it defaults to nothing rather than every render site
   *  having to pass a no-op. */
  onCardClick?: (card: CardDef) => void
}) {
  const hasImage = !!card.cardImageUrl
  const textColor = card.cardTextColor || '#ffffff'
  // See navTransitions.ts's own doc on why this check has to happen HERE,
  // at the already-mounted source of the click, rather than at the
  // destination's ViewTransition wrapper the way it used to.
  const isMobile = useIsMobile()
  return (
    // A real <Link>, not a <button onClick={card.go}> — go still exists on
    // CardDef for the one place a tile opens programmatically instead of by
    // a visible click (Landing's search "Places" results, `card.go()`), but
    // the tile itself now navigates the normal way: Link already knows to
    // leave a modified click (cmd/ctrl/middle) to the browser and only
    // intercept a plain one, which a click handler can never do on its own.
    <Link
      href={card.href}
      className="group block w-full cursor-pointer"
      onClick={onCardClick ? () => onCardClick(card) : undefined}
      // Every card here is one level deeper than the home screen it's on —
      // a real category, a form, a pseudo-category (Map/Zmanim/Eruv) — so
      // this is always a "forward" drill-down, but only worth tagging on
      // mobile — desktop's screens are plain fades with no edge the
      // content is conceptually anchored to (see navTransitions.ts).
      transitionTypes={isMobile ? ['nav-forward'] : undefined}
    >
      <div
        className={`relative aspect-[4/3] rounded-2xl overflow-hidden ${hasImage ? 'bg-slate-100' : tint} ring-1 ring-slate-900/5 flex flex-col items-center justify-center gap-1 p-4 text-center transition-all duration-200 group-hover:shadow-lg group-hover:shadow-slate-900/10 group-hover:-translate-y-0.5 group-active:scale-[0.97] group-active:shadow-lg group-active:shadow-slate-900/10`}
      >
        {/* next/image rather than a CSS background, which is what this was.
            A background-image ships one full-size original to every device:
            no resizing, no AVIF/WebP, no lazy loading, and no way to tell the
            browser how big it will actually be. These tiles are the heaviest
            thing on the desktop home screen, so that was the page's weight.

            `fill` + `sizes` is what makes it worth doing: sizes tells Next the
            tile is a quarter of the grid on desktop and half on a phone, so it
            generates and serves that width instead of the original.

            alt="" is deliberate — the title is rendered as real text directly
            below, so describing the photo again would just make a screen
            reader say everything twice. */}
        {hasImage && (
          <Image
            src={card.cardImageUrl!}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            // Set on the first row of cards only — they're above the fold and
            // usually the largest contentful paint. Lazy-loading those delays
            // the very thing the page is measured on.
            priority={priority}
            // An admin can paste a URL from anywhere. next/image *throws* on a
            // host it wasn't configured for, so without this one pasted link
            // takes down the whole home screen — which is exactly what happened
            // the first time this was wired up. Unlisted hosts render as-is.
            unoptimized={!isOptimizableImage(card.cardImageUrl!)}
          />
        )}
        {/* A photo card gets a dark scrim regardless of the photo's own
            brightness, so the title stays legible no matter what's pasted in
            — same idea as the cRc-style reference. */}
        {hasImage && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden="true" />}
        {/* The icon only shows on the flat-tint look — over a photo, an emoji
            (a color glyph, not a strokable outline) never reads as a clean
            icon, so photo cards go title-only instead. */}
        {card.icon && !hasImage && (
          <CategoryGlyph categoryId={card.id} icon={card.icon} className="relative h-8 w-8" />
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
    </Link>
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
  onCardClick,
}: {
  cards: CardDef[]
  loadingCount?: number
  /** See Card's own doc — threaded straight through. */
  onCardClick?: (card: CardDef) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
      {cards.map((card, i) => (
        <Card
          key={card.id ?? card.title}
          card={card}
          tint={TINTS[i % TINTS.length]}
          // The first row is above the fold at every breakpoint (4 cards is the
          // widest row the grid ever renders), so those load eagerly.
          priority={i < 4}
          onCardClick={onCardClick}
        />
      ))}
      {Array.from({ length: loadingCount }, (_, i) => (
        <CardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  )
}

/** One row in CompactCardGrid — the tinted, colour-ringed icon glyph, the
 *  category's name, and how many places are in it.
 *
 *  This used to prefer the admin-set home-screen photo, cropped to a 32px
 *  circle, on the reasoning that an avatar that small costs the same visual
 *  weight as the glyph it replaces. It does cost the same weight — but it
 *  does not carry the same information, and that's the part that was wrong.
 *  Rendered at 32px in a 1440px viewport, this community's twelve category
 *  photos (Food, Childcare, Hospitals, Schools, Hotels, Grocery…) all resolve
 *  to the same indistinct brown-grey disc: a photograph needs a subject you
 *  can make out, and at 32px there is no subject, only average colour. The
 *  glyph is legible at that size and the category's own `pinColor` makes each
 *  row distinguishable at a glance, which is what an index is for.
 *
 *  The photos are not the problem — their size is. `CardGrid`'s full tile is
 *  still exactly right for a small curated set, where a photo has room to be
 *  one. See `count` below for the other half of what a row here should say. */
function CompactCard({
  card,
  color,
  onCardClick,
}: {
  card: CardDef
  color: string
  onCardClick?: (card: CardDef) => void
}) {
  return (
    // No border/background at rest — this is navigation, not content; a
    // border on every one of 15+ rows just moves the "too many different
    // things crammed in" problem from photos to boxes. Background-only on
    // hover, same as the tab nav's own mega-menu items and its section
    // buttons — a click target still reads clearly without a permanent box
    // around it.
    <Link
      href={card.href}
      className="group flex items-center gap-2.5 rounded-xl px-3.5 py-3 transition-colors hover:bg-slate-50"
      onClick={onCardClick ? () => onCardClick(card) : undefined}
      // No transitionTypes tag here, unlike Card above — this row never
      // mounts on mobile (see this component's own doc), and desktop never
      // wants the slide (see navTransitions.ts), so there's no case where
      // tagging it would do anything but risk a stray whole-page crossfade.
    >
      {card.icon ? (
        // Named (desktop only — this component never mounts on mobile, see
        // its own doc) so React's real <ViewTransition> grows this small
        // icon badge into the bigger one GenericDirectory shows at the top
        // of the category page, instead of a flat crossfade — the "shared
        // element morph" pattern, matched on `name` alone (see that
        // component's own comment for the other half). Only when `card.id`
        // exists to key it on: the couple of hand-built cards with no id
        // just skip the wrap and render plainly.
        card.id ? (
          <ViewTransition name={`category-badge-${card.id}`}>
            <CategoryIcon icon={card.icon} categoryId={card.id} color={color} className="h-9 w-9 text-base shrink-0" sizePx={36} />
          </ViewTransition>
        ) : (
          <CategoryIcon icon={card.icon} categoryId={card.id} color={color} className="h-9 w-9 text-base shrink-0" sizePx={36} />
        )
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-full bg-slate-100" aria-hidden="true" />
      )}
      {/* min-w-0 on the COLUMN, not just the label: without it the flex item
          takes its content's intrinsic width and the truncate below never
          fires, so a long category name pushes the row wider than its grid
          track instead of ellipsing. */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-slate-800 group-hover:text-primary transition-colors">
          {card.title}
        </span>
        {/* Absent, not zero-filled, when the caller has no count for this
            card — the pseudo-categories (Map, Zmanim, Eruv) and the Support/
            Volunteer entry cards aren't collections of places and have
            nothing true to say here, and "0 places" on one of those would be
            a worse answer than silence. Same reason the count is hidden
            while listings are still loading rather than flashing "0". */}
        {card.count != null && (
          <span className="truncate text-xs text-slate-400 tabular-nums">{card.count}</span>
        )}
      </span>
    </Link>
  )
}

/** A dense alternative to CardGrid — icon/avatar + name in a small row
 *  instead of a full photo tile, tiled many-per-line rather than 2-4 wide.
 *  For a list meant to hold EVERY card at once (see Landing's "Browse
 *  everything"), not a curated few: a wall of full-size photo tiles reads as
 *  "trying to fit too many different things in one place" (an admin-uploaded
 *  photo, a flat tint, a test fixture's placeholder — all at hero-card size,
 *  side by side) and only gets heavier as more categories are added. This
 *  stays calm at any count because every row costs the same, small amount of
 *  space regardless of what's behind it — a 32px circular crop of the
 *  card's own photo where one's set (see CompactCard's own doc — small
 *  enough to cost the same weight as the icon glyph it replaces), that
 *  glyph otherwise. CardGrid's rich full-tile photo treatment is still
 *  exactly right for a SMALL curated set ("Popular right now") where a
 *  handful of considered photos are the point, not a liability. */
// How many rows to show before collapsing.
const ROWS_WHEN_COLLAPSED = 4

export function CompactCardGrid({
  cards,
  categories,
  onCardClick,
}: {
  cards: CardDef[]
  /** Resolves each card's icon-avatar tint — see getCategoryColor. */
  categories: CategoryConfig[] | null
  onCardClick?: (card: CardDef) => void
}) {
  // Collapsed by default — a community with a dozen-plus categories turned
  // this from "an index" into a wall of rows below the fold before a
  // visitor got to the map or anything else on the page.
  const [expanded, setExpanded] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  // Pixel height that clips the grid to exactly ROWS_WHEN_COLLAPSED rows, or
  // null when there's nothing to collapse (four rows or fewer already, or
  // not yet measured). A fixed ITEM count here would be wrong on its own
  // terms — this grid runs 2/3/4 columns depending on viewport width (see
  // its own className below), so "16 items" is four rows at the widest
  // column count and well over four at the narrowest. Measuring the real
  // rendered row positions instead — same technique GenericDirectory's own
  // alignRows already uses for "how many cards share a row" — gets the
  // right cutoff at any width instead of guessing one.
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    function measure() {
      const grid = gridRef.current
      if (!grid) return
      const children = Array.from(grid.children) as HTMLElement[]
      if (children.length === 0) {
        setCollapsedHeight(null)
        return
      }
      const gridTop = grid.getBoundingClientRect().top
      const rowTops: number[] = []
      for (const child of children) {
        const top = Math.round(child.getBoundingClientRect().top)
        if (!rowTops.includes(top)) rowTops.push(top)
      }
      if (rowTops.length <= ROWS_WHEN_COLLAPSED) {
        setCollapsedHeight(null)
        return
      }
      // Bottom of the last child whose row is among the first
      // ROWS_WHEN_COLLAPSED — everything after that gets clipped.
      const lastVisibleRowTop = rowTops[ROWS_WHEN_COLLAPSED - 1]
      let bottom = 0
      for (const child of children) {
        if (Math.round(child.getBoundingClientRect().top) <= lastVisibleRowTop) {
          bottom = Math.max(bottom, child.getBoundingClientRect().bottom)
        }
      }
      setCollapsedHeight(bottom - gridTop)
    }
    measure()
    // Column count depends on the grid's actual pixel width, which only a
    // real resize can change — same reasoning as GenericDirectory's own
    // alignRows re-pass.
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [cards.length])

  const isCollapsible = collapsedHeight != null

  return (
    <div>
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-4"
        style={!expanded && collapsedHeight != null ? { maxHeight: collapsedHeight } : undefined}
      >
        {cards.map((card) => (
          <CompactCard
            key={card.id ?? card.title}
            card={card}
            color={getCategoryColor(categories, card.id ?? '')}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-medium text-primary transition-colors hover:bg-slate-50"
        >
          {expanded ? 'Show less' : 'Show more'}
          <span aria-hidden="true" className="text-[10px]">
            {expanded ? '▴' : '▾'}
          </span>
        </button>
      )}
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
 *  drops a card just because it has no assigned section. Takes just
 *  title/cardIds (not the full `HomeSection`) so the admin preview can pass
 *  its in-progress draft — which has no `sortOrder` yet — straight through. */
export function groupCardsIntoSections(
  cards: CardDef[],
  sections: Pick<HomeSection, 'title' | 'cardIds'>[],
): CardSectionDef[] {
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
    // Stamp straight-line distance the same way the directory does (see
    // withMilesFromAddress) — unrounded, so two close-together hits don't tie
    // and fall back to arbitrary order below: address-anchored categories
    // only, when the listing has coordinates.
    const withDistance =
      coords && category.hasAddress !== false && item.geo
        ? { ...item, milesFromAddress: haversineMiles(coords, item.geo) }
        : item
    hits.push({
      item: withDistance,
      category,
      categoryLabel: labelById.get(item.category) ?? item.category,
      matchedTags,
      term: matchedTags[0] ?? query.trim(),
    })
  }
  // Closest first when the visitor has a location; otherwise most-upvoted first,
  // so the landing search doesn't fall back to arbitrary storage order.
  hits.sort((a, b) =>
    a.item.milesFromAddress != null || b.item.milesFromAddress != null
      ? travelCompare(a.item, b.item)
      : (b.item.upvotes ?? 0) - (a.item.upvotes ?? 0) || a.item.name.localeCompare(b.item.name),
  )
  return hits.slice(0, limit)
}

/** The "Places" results list: each hit rendered as the same card its category
 *  directory uses, so a searched place is the full listing (davening times,
 *  upvotes, filters, and all). */
export function PlacesResults({
  hits,
  onOpen,
  showDistanceSlot,
}: {
  hits: ListingHit[]
  onOpen: (hit: ListingHit, action?: 'edit' | 'report') => void
  /** No location set yet — hold each distance-based hit's distance column
   *  open with a tappable placeholder instead of omitting it, same as
   *  GenericDirectory's own `addressPrompt` (see GenericListingCard's
   *  `showDistanceSlot` doc). A mixed-category list can mix distance-based
   *  hits with ones that have no address at all (e.g. WhatsApp groups), so
   *  this is combined per-hit with that hit's own `category.hasAddress`
   *  rather than applied blindly to every card. */
  showDistanceSlot?: boolean
}) {
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  return (
    <section className="mt-10 sm:mt-12">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Places
      </h2>
      {/* desktop: a grid instead of a single column, same reasoning (and same
          track-sizing pitfalls, already solved once) as GenericDirectory's
          own listing grid — see that component's own doc for why
          auto-fill/minmax/1fr, not a fixed column count or auto-fit. */}
      <div className="space-y-2 desktop:space-y-0 desktop:grid desktop:gap-3 desktop:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {hits.map((hit) => (
          <div key={hit.item.id} className="desktop:max-w-md">
            <GenericListingCard
              item={hit.item}
              category={hit.category}
              showDistanceSlot={!!showDistanceSlot && hit.category.hasAddress !== false}
              upvotes={!!hit.category.upvotesEnabled}
              count={voteCounts[hit.item.id] ?? hit.item.upvotes ?? 0}
              onVote={(c) => setVoteCounts((prev) => ({ ...prev, [hit.item.id]: c }))}
              onTagClick={(tag) => onOpen({ ...hit, term: tag })}
              onNameClick={() => onOpen(hit)}
              onFilterOpen={() => onOpen(hit)}
              onFilterBool={() => onOpen(hit)}
              onFilterSelect={() => onOpen(hit)}
              onEdit={() => onOpen(hit, 'edit')}
              onReport={() => onOpen(hit, 'report')}
            />
          </div>
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

/** "22 places" / "19 listings" for a category's browse-index row, or
 *  undefined when there's nothing honest to say.
 *
 *  Two nouns, picked off `hasAddress` rather than off a hardcoded list of
 *  category ids: a category whose listings have no address isn't a set of
 *  places you can go to — WhatsApp Groups and Networking are the live cases —
 *  and calling them places would be wrong in the one word the row exists to
 *  add. Any future address-less category gets the right noun for free.
 *
 *  Undefined (not "0") when counts haven't loaded or the category has none:
 *  see CompactCard on why silence beats a zero here. */
export function cardCount(c: CategoryConfig, counts: Record<string, number> | null | undefined): string | undefined {
  const n = counts?.[c.id]
  if (!n) return undefined
  return `${n} ${c.hasAddress === false ? (n === 1 ? 'listing' : 'listings') : (n === 1 ? 'place' : 'places')}`
}

/** Resource cards: every live category (restaurants, groceries, hotels, …)
 *  plus the hand-curated pages. Returns null while categories are loading
 *  (show skeletons). */
export function resourceCards(
  nav: NavigateFn,
  categories: CategoryConfig[] | null,
  // The real path each card's `go` above already navigates to under the
  // hood — see CardDef.href's own comment for why this is threaded in
  // alongside `nav` rather than derived from it.
  communitySlug: string,
  // How many approved listings each category holds, keyed by category id —
  // null while listings are still loading, which is why `cardCount` below
  // returns undefined rather than "0 places" for a missing entry. Threaded in
  // rather than fetched here because Landing already holds the full listing
  // set for its own search.
  counts?: Record<string, number> | null,
): CardDef[] | null {
  if (categories === null) return null

  const medical = categories.find((c) => c.kind === 'medical')
  const zmanim = categories.find((c) => c.kind === 'zmanim')
  const eruv = categories.find((c) => c.kind === 'eruv')

  const cards = [
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
          href: routes.slug(communitySlug, 'hospitals'),
        }]
      : []),
    ...categories.filter((c) => c.kind === 'listing').map((c) => ({
      title: c.pluralLabel,
      id: c.id,
      icon: c.icon,
      count: cardCount(c, counts),
      cardImageUrl: c.cardImageUrl,
      cardTextColor: c.cardTextColor,
      keywords: [...new Set([...labelWords(c), ...(CATEGORY_KEYWORDS[c.id] ?? []), c.id.replaceAll('-', ' ')])],
      go: () => nav('patient', 'find', { findView: c.id }),
      href: routes.slug(communitySlug, c.id),
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
          href: routes.slug(communitySlug, 'zmanim'),
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
          href: routes.slug(communitySlug, 'eruv'),
        }]
      : []),
  ]

  // Hospitals/Zmanim/Eruv are built above as one-off cards (they're pseudo-
  // categories, not `kind === 'listing'`), so without this they always land
  // in the fixed positions they were spliced in at — Hospitals first, Zmanim
  // and Eruv last — rather than wherever their own title actually falls.
  // `categories` itself is already alphabetical by pluralLabel (see
  // listCategoriesUncached's own comment), so sorting only the pseudo-
  // category cards into that same order would work too, but sorting
  // everything is simpler and produces the same result. groupCardsIntoSections
  // (HeaderNav's "Categories" menu) re-derives each section's order from its
  // own admin-configured `cardIds` regardless of this array's order, so this
  // only affects "Browse everything"'s flat grid, which is exactly the one
  // that's meant to be alphabetical.
  cards.sort((a, b) => a.title.localeCompare(b.title))
  return cards
}

/** The hand-built cards at the front of the grid — Patient & Family Support,
 *  Volunteer, and every admin-created custom form. (The Map card lives
 *  outside the grid now — see the "View Map" button in HeroHeading.) Shared
 *  by the live home page (Landing.tsx) and the admin Home page preview, so
 *  the two never drift apart. */
export function useEntryCards(
  onOpenFlow: (kind: string, preselect?: string[]) => void,
): CardDef[] {
  const communitySlug = useCommunitySlug()
  const supportForm = useForm('support')
  const volunteerForm = useForm('volunteer')
  // Every other form is an admin-created custom one — support/volunteer keep
  // their own dedicated cards below (fixed copy/keywords), so exclude them
  // here rather than double-listing.
  const customForms = (useForms() ?? []).filter((f) => f.id !== 'support' && f.id !== 'volunteer')

  return [
    ...(community.features.patientSupport && supportForm
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
          href: routes.slug(communitySlug, 'support'),
        }]
      : []),
    ...(community.features.volunteer && volunteerForm
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
          href: routes.slug(communitySlug, 'volunteer'),
        }]
      : []),
    ...customForms.map((f) => ({
      title: f.title,
      id: f.id,
      icon: f.icon,
      cardImageUrl: f.cardImageUrl,
      cardTextColor: f.cardTextColor,
      go: () => onOpenFlow(f.id),
      href: routes.slug(communitySlug, f.id),
    })),
  ]
}
