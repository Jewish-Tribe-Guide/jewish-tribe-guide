'use client'

import { useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import Link from 'next/link'
import type { CategoryConfig } from '@/lib/categories'
import type { HomeSection } from '@/lib/homeSections'
import type { NavigateFn } from '@/types'
import { categoryCards } from '@/lib/cardSearch'
import { useForm, useForms } from '@/lib/useForms'
import { community } from '@/community.config'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import CategoryIcon from '@/components/CategoryIcon'
import { DotsIcon } from '@/components/icons'
import { getCategoryColor } from '@/lib/categoryColor'

export type CardDef = {
  title: string
  go: () => void
  /** The same destination `go` navigates to, as a real path, so a tile
   *  renders a genuine `<Link>` (cmd/ctrl/middle-click open a new tab). */
  href: string
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
 *  row distinguishable at a glance, which is what an index is for. See
 *  `count` below for the other half of what a row here should say. */
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
      // Same reasoning as Card's own prefetch={false}: a search-results list
      // here can be a dozen-plus rows, each an eager prefetch nobody asked
      // for yet.
      prefetch={false}
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

/** Icon + name in a small row, tiled many-per-line.
 *  For a list meant to hold EVERY card at once (see Landing's "Browse
 *  everything"), not a curated few: a wall of full-size photo tiles reads as
 *  "trying to fit too many different things in one place" (an admin-uploaded
 *  photo, a flat tint, a test fixture's placeholder — all at hero-card size,
 *  side by side) and only gets heavier as more categories are added. This
 *  stays calm at any count because every row costs the same, small amount of
 *  space regardless of what's behind it. */
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

// How many real cards show before the trailing "More" tile, collapsed —
// matches the count in the user's own reference image (9 categories + one
// "More" tile = 10 total). A fixed number, not a measured "however many fit"
// — this app has one desktop breakpoint, not several to size against, and a
// fixed count is what makes `flex-1` below reliably lay out as one
// non-wrapping row instead of needing real layout measurement (the
// CompactCardGrid approach) just to decide whether to show a tile.
const COLLAPSED_TILE_COUNT = 9

/** Desktop mockup match (Phase 5, docs/desktop-mockup-plan.md), revised
 *  twice after user review — first to a horizontal-scroll row, then to
 *  this: the "Explore by Category" card's tile grid, a bigger, friendlier
 *  icon per category (64px, tinted per getCategoryColor, same as
 *  CompactCard's own smaller version). No border/background on the tile
 *  itself, at rest or on hover — just the icon and label sitting directly
 *  on the card's own white background, the same "navigation, not a boxed
 *  object" reasoning CompactCard's own doc gives for its rows.
 *
 *  Collapsed (`expanded` false) is a single row, no scrolling and no wrap —
 *  the first `COLLAPSED_TILE_COUNT` cards (by whatever order the caller
 *  already sorted `cards` into — Landing sorts by listing count, most to
 *  least, matching the reference image) plus a trailing "More" tile when
 *  there are more. `flex-1` on every tile (not a fixed width) is what
 *  guarantees the row itself never needs to scroll or wrap: exactly
 *  `COLLAPSED_TILE_COUNT` (+1 for "More") tiles share the row's width
 *  evenly, however wide that ends up being, rather than each claiming a
 *  fixed size and overflowing. Expanded is the opposite shape: EVERY card
 *  wrapped into a `grid-cols-4 lg:grid-cols-8` grid, no "More" tile, no cap
 *  — a real "full view". Both states are controlled by the caller
 *  (`expanded`) rather than owned here, because the toggle that drives it
 *  ("View all →") lives in Landing's own header row above this grid, not
 *  beside it — CompactCardGrid can own its own "Show more" because that
 *  button sits directly under its grid; this one can't. CompactCardGrid
 *  itself is untouched and still used for desktop search results (Landing's
 *  own `desktopResultsNode`, rendered below this card's header row once the
 *  hero's search box puts something in `q`). */
export function CategoryTileRow({
  cards,
  categories,
  expanded,
  onCardClick,
  onExpand,
}: {
  /** Already in the order this should render — Landing sorts by listing
   *  count (most to least) before passing this in; this component doesn't
   *  re-sort. */
  cards: CardDef[]
  /** Resolves each card's icon-avatar tint — see getCategoryColor. */
  categories: CategoryConfig[] | null
  /** false: the first COLLAPSED_TILE_COUNT cards plus a trailing "More"
   *  tile. true: every card, wrapped, no cap. */
  expanded: boolean
  onCardClick?: (card: CardDef) => void
  /** Fired by the trailing "More" tile — same action as the header row's
   *  own "View all" toggle (Landing owns the actual `expanded` state). Only
   *  meaningful (and only rendered) when collapsed and there's a "More"
   *  tile to click. */
  onExpand?: () => void
}) {
  const visible = expanded ? cards : cards.slice(0, COLLAPSED_TILE_COUNT)
  const hasMore = !expanded && cards.length > COLLAPSED_TILE_COUNT

  const tileClassName = 'flex flex-col items-center rounded-xl px-2 py-2 text-center transition-colors hover:bg-slate-50'

  return (
    <div className={expanded ? 'grid grid-cols-4 gap-6 lg:grid-cols-8' : 'flex gap-6'}>
      {visible.map((card) => (
        <Link
          key={card.id ?? card.title}
          href={card.href}
          className={`${tileClassName} ${expanded ? '' : 'min-w-0 flex-1'}`}
          onClick={onCardClick ? () => onCardClick(card) : undefined}
          // Same reasoning as Card's own prefetch={false} in this file —
          // this row renders every category at once, expanded or not.
          prefetch={false}
        >
          {card.icon ? (
            // Named the same way CompactCard's own badge is (desktop only,
            // matched on `category-badge-${card.id}`) so a real
            // <ViewTransition> grows this tile's icon into the bigger one
            // GenericDirectory shows at the top of the category page —
            // whichever of the two (this grid or CompactCardGrid's search
            // results) the visitor actually clicked through.
            card.id ? (
              <ViewTransition name={`category-badge-${card.id}`}>
                <CategoryIcon
                  icon={card.icon}
                  categoryId={card.id}
                  color={getCategoryColor(categories, card.id)}
                  className="h-16 w-16 text-[28px]"
                  sizePx={64}
                />
              </ViewTransition>
            ) : (
              <CategoryIcon
                icon={card.icon}
                categoryId={card.id}
                color={getCategoryColor(categories, card.id ?? '')}
                className="h-16 w-16 text-[28px]"
                sizePx={64}
              />
            )
          ) : (
            <span className="h-16 w-16 shrink-0 rounded-full bg-slate-100" aria-hidden="true" />
          )}
          {/* No `truncate` — a category name like "Networking" or
              "Hospitals" shouldn't ever end in an ellipsis on a tile with
              room to wrap. Two lines (`leading-tight` keeps them close) is
              the worst case; the count below stays single-line since a
              number like "72 places" never needs to wrap. */}
          <span className="mt-3 w-full text-balance text-base font-semibold leading-tight text-ink">{card.title}</span>
          {card.count != null && (
            <span className="w-full truncate text-sm text-slate-500">{card.count}</span>
          )}
        </Link>
      ))}
      {hasMore && (
        <button type="button" onClick={onExpand} className={`${tileClassName} min-w-0 flex-1 cursor-pointer`}>
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden="true">
            <DotsIcon className="h-6 w-6" />
          </span>
          <span className="mt-3 w-full text-balance text-base font-semibold leading-tight text-ink">More</span>
          <span className="w-full truncate text-sm text-slate-500">See all</span>
        </button>
      )}
    </div>
  )
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

/** "22 listings" for a category's browse-index row, or undefined when
 *  there's nothing honest to say.
 *
 *  One noun everywhere, deliberately — this used to split "N places" /
 *  "N listings" off `hasAddress` (a category with no address, like
 *  WhatsApp Groups or Networking, isn't a set of places you can go to), but
 *  that made "place" the odd one out: a single term that works regardless
 *  of whether the category has an address is simpler than two that have to
 *  agree with each other everywhere they appear.
 *
 *  Undefined (not "0") when counts haven't loaded or the category has none:
 *  see CompactCard on why silence beats a zero here. */
export function cardCount(c: CategoryConfig, counts: Record<string, number> | null | undefined): string | undefined {
  const n = counts?.[c.id]
  if (!n) return undefined
  return `${n} listing${n === 1 ? '' : 's'}`
}

/** "3 listings" for the Eruv card, in a category card's words (Oct 15),
 *  from `counts.eruv` (see withEruvCount); silent until known. */
export function eruvCardCount(counts: Record<string, number> | null | undefined): string | undefined {
  const n = counts?.eruv
  if (!n) return undefined
  return `${n} listing${n === 1 ? '' : 's'}`
}

/** The listing counts with the Eruv card's beside them, under its card id
 *  (`eruv`, never a listing category's id: see categoryCards), so the
 *  browse index counts it and sorts it as it does a category. */
export function withEruvCount(counts: Record<string, number> | null, eruvim: number | null): Record<string, number> | null {
  return eruvim === null ? counts : { ...(counts ?? {}), eruv: eruvim }
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
  // How many approved listings each category holds, keyed by category id
  // (and how many eruvim, under `eruv`: withEruvCount) —
  // null while listings are still loading, which is why `cardCount` below
  // returns undefined rather than "0 places" for a missing entry. Threaded in
  // rather than fetched here because Landing already holds the full listing
  // set for its own search.
  counts?: Record<string, number> | null,
): CardDef[] | null {
  if (categories === null) return null

  // Which cards there are and what each answers to live in cardSearch.ts,
  // shared with the server's re-run of missed searches; this adds how each
  // one looks and where it goes.
  const cards: CardDef[] = categoryCards(categories).map(({ id, view, title, keywords, category: c }) => ({
    title,
    id,
    icon: c.icon,
    ...(c.kind === 'listing' ? { count: cardCount(c, counts) } : c.kind === 'eruv' ? { count: eruvCardCount(counts) } : {}),
    keywords,
    go: () => nav('patient', 'find', { findView: view }),
    href: routes.slug(communitySlug, view),
  }))

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
      go: () => onOpenFlow(f.id),
      href: routes.slug(communitySlug, f.id),
    })),
  ]
}
