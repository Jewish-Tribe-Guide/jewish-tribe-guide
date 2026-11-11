'use client'

import { useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { isOptimizableImage, storageThumbnailUrl } from '@/lib/imageHosts'
import { CategoryGlyph, hasCategoryIcon, useGlyphKey } from '@/lib/categoryIcons'
import type { CategoryConfig } from '@/lib/categories'
import type { HomeSection } from '@/lib/homeSections'
import type { NavigateFn } from '@/types'
import { categoryCards } from '@/lib/cardSearch'
import { useForm, useForms } from '@/lib/useForms'
import { community } from '@/community.config'
import { useCommunitySlug } from '@/lib/communityContext'
import { routes } from '@/lib/routes'
import CategoryIcon from '@/components/CategoryIcon'
import { GridIcon } from '@/components/icons'
import { getCategoryColor, getCategoryPicture, getCategoryTilePhoto } from '@/lib/categoryColor'

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
 *  `count` below for the other half of what a row here should say.
 *
 *  `picture` is a different field: the one an admin sets for the icon spot
 *  itself ("Or use a picture instead"), so it is chosen to read at badge
 *  size, unlike the wide home-screen photo above. When set it replaces the
 *  glyph here as on every other badge of the category (Nov 11). */
function CompactCard({
  card,
  color,
  picture,
  onCardClick,
}: {
  card: CardDef
  color: string
  picture: string | null
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
            <CategoryIcon icon={card.icon} categoryId={card.id} iconImageUrl={picture} color={color} className="h-9 w-9 text-base shrink-0" sizePx={36} />
          </ViewTransition>
        ) : (
          <CategoryIcon icon={card.icon} categoryId={card.id} iconImageUrl={picture} color={color} className="h-9 w-9 text-base shrink-0" sizePx={36} />
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
            picture={getCategoryPicture(categories, card.id)}
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

// How many cards show before the trailing "All categories" tile, collapsed:
// three rows of five with that tile last (board G5b, Nov 11: the rows fill
// the screen and match the map card below).
const COLLAPSED_TILE_COUNT = 14

/** A category's photo, cut to its 16:10 tile. Supabase uploads go through the
 *  storage thumbnail (falling back to the original if that fails, as
 *  CategoryIcon does); an admin-pasted URL from an unlisted host skips
 *  next/image's optimizer, which would throw on it. */
function TilePhoto({ src }: { src: string }) {
  const thumb = storageThumbnailUrl(src, 210)
  const [failedThumb, setFailedThumb] = useState<string | null>(null)
  const useThumb = thumb !== null && failedThumb !== thumb
  return (
    <Image
      src={useThumb ? thumb : src}
      alt=""
      fill
      sizes="(min-width: 1200px) 210px, 18vw"
      className="object-cover"
      unoptimized={useThumb || !isOptimizableImage(src)}
      onError={useThumb ? () => setFailedThumb(thumb) : undefined}
    />
  )
}

/** A tile with no photo: the category's line icon on plain grey, or its
 *  initial when it has no line icon, never its emoji (the site draws no
 *  emoji as icons). */
function TileGlyph({ id, title }: { id: string | undefined; title: string }) {
  const key = useGlyphKey(id)
  return (
    <span className="flex h-full w-full items-center justify-center text-slate-500" data-testid="category-tile-glyph" aria-hidden="true">
      {hasCategoryIcon(key) ? (
        <CategoryGlyph categoryId={id} icon="" className="h-9 w-9" />
      ) : (
        <span className="text-3xl font-extrabold text-slate-400">{title.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}

const tileBox = 'relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-slate-100'
const tileName = 'mt-2.5 block text-base font-bold leading-tight text-ink'

/** The computer home's Explore by Category (board H1, Nov 11, the user:
 *  "soooo much better"): rectangular photo tiles, five across, the name
 *  under each and nothing else. It replaced a row of small 64px circles that
 *  mixed photos with tinted icons and put a listing count under each, which
 *  read as an icon pack on a wide screen.
 *
 *  Each tile's photo is getCategoryTilePhoto's: the category's own picture,
 *  else its wide card photo; a category with neither shows its line glyph on
 *  plain grey, never a tinted circle. Collapsed shows the first
 *  COLLAPSED_TILE_COUNT cards (in the caller's order, most listings first)
 *  and an "All categories" tile; expanded shows every card. The caller owns
 *  `expanded`, since "Show fewer categories" sits in its heading. */
export function CategoryTileRow({
  cards,
  categories,
  expanded,
  onCardClick,
  onExpand,
}: {
  /** Already in the order this should render. */
  cards: CardDef[]
  categories: CategoryConfig[] | null
  expanded: boolean
  onCardClick?: (card: CardDef) => void
  /** Fired by the "All categories" tile; only drawn when collapsed and
   *  there are more cards than fit. */
  onExpand?: () => void
}) {
  const visible = expanded ? cards : cards.slice(0, COLLAPSED_TILE_COUNT)
  const hasMore = !expanded && cards.length > COLLAPSED_TILE_COUNT

  return (
    <div className="grid grid-cols-5 gap-x-4 gap-y-5">
      {visible.map((card) => {
        const photo = getCategoryTilePhoto(categories, card.id)
        const box = (
          <span className={tileBox} data-testid="category-tile-photo">
            {photo ? (
              <TilePhoto src={photo} />
            ) : (
              <TileGlyph id={card.id} title={card.title} />
            )}
          </span>
        )
        return (
          <Link
            key={card.id ?? card.title}
            href={card.href}
            className="group block min-w-0 rounded-xl"
            onClick={onCardClick ? () => onCardClick(card) : undefined}
            // Same reasoning as Card's own prefetch={false} in this file:
            // this row renders every category at once.
            prefetch={false}
          >
            {/* Named as CompactCard's badge is, so a <ViewTransition> grows
                it into the badge at the top of the category page. */}
            {card.id ? <ViewTransition name={`category-badge-${card.id}`}>{box}</ViewTransition> : box}
            <span className={`${tileName} group-hover:text-primary`}>{card.title}</span>
          </Link>
        )
      })}
      {hasMore && (
        <button type="button" onClick={onExpand} className="group block min-w-0 cursor-pointer rounded-xl text-left">
          <span className={`${tileBox} flex items-center justify-center text-slate-500`} aria-hidden="true">
            <GridIcon className="h-9 w-9" />
          </span>
          <span className={`${tileName} group-hover:text-primary`}>All categories</span>
        </button>
      )}
    </div>
  )
}

// ── Home-screen sections ──────────────────────────────────────────────────────
// The grouping shown on the home page — admin-editable (title + which cards, in
// what order) via the Sections tab in /admin; see src/lib/homeSections.ts and
// useHomeSections.ts. A card not listed in any section (a category with no
// assigned home yet, or any future custom form) falls into a trailing "Other"
// section (the user, Nov 4) instead of silently disappearing from the home screen.

export type CardSectionDef = { title: string; cards: CardDef[] }

/** Where a card in no section lands, and new categories with it. */
export const LEFTOVER_SECTION = 'Other'

/** Sorts cards into the given sections (in each section's own listed order),
 *  then a trailing "Other" section for anything left over — never
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
  if (leftover.length > 0) grouped.push({ title: LEFTOVER_SECTION, cards: leftover })

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
