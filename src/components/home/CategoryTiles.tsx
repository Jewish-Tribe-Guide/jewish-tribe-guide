'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { categoryTint, getCategoryColor, getCategoryTilePhoto } from '@/lib/categoryColor'
import { BrowseFoot, useBrowseCards } from './BrowseAll'
import { TilePhoto, type CardDef } from './sections'

/** Most places first. A card that counts nothing (a form, a page) after
 *  those that do, and ties, in the admin's order. Until the places load,
 *  the admin's order as it is. */
export function mostListedFirst(cards: readonly CardDef[], counts: Record<string, number> | null): CardDef[] {
  if (!counts) return [...cards]
  const n = (card: CardDef) => (card.count && card.id ? (counts[card.id] ?? 0) : -1)
  return [...cards].sort((a, b) => n(b) - n(a))
}

// ── The phone home's categories, as tiles (the user, Oct 17) ────────────────
// The list read as dull: every row alike, three screens of it. Tiles, each
// in its own colour: the site's line glyph on its tint and its name. Not
// the old photo tiles (stock photos, one download each). Most places first,
// as the computer's grid (the user, Oct 17), and no count under a tile
// (the user, Oct 17): the order already says which are biggest, "Cemetery
// 1" made the guide look thin, and the category page says how many. No
// group headings: tried under them, a group of one or two left tiles alone
// in a row (the user, on a phone: back to without). Every category is a
// tile, since this is where a phone browses: no "Also:" line of the ones
// that didn't fit.
//
// Board J2b (the user, Nov 11): each tile is now the category's one
// picture, square, with its name on it over a dark fade. That brings back
// photo tiles, which Oct 17 had set aside (one download each), so the
// photos are small copies sized to the tile. A category with no picture is
// its own tint with its line icon, the name dark under it.
//
// Board K1c (the user, Nov 11): the tiles sit in one white box under a
// small "Explore by Category" label, the same as Right now's label and box
// above, so the two halves of the home read as a pair. Each name is in the
// middle of its tile ("I'm fighting my brain/eyes which wants to look
// center"), over an even darkening rather than a fade at the bottom. No
// icons on the home ("It feels childish"): a category with no picture is
// its tint with its name in the middle.
//
// Board M1 (the user, Nov 12: "Build M1"): the white box round the tiles
// is gone. The photos are cards already, so a card round them read as a
// box in a box. The tiles sit on the page under their label, as wide as
// Right now's card; the matching labels are what tie the two together.
//
// Board R3 (the user, Nov 14: "let's do it"): the name moves under the
// picture, in dark text. Right now's rows became photos with white words
// on them (Q1), and tiles the same made the page one run of pictures; a
// picture with its name under it reads as a menu, apart from the answer
// above it. A category with no picture keeps its tint as the picture.

/** The phone home's label over a box (Right now, Explore by Category):
 *  small, grey, capitals. */
export const HOME_LABEL = 'mb-2 text-[0.78125rem] font-extrabold uppercase tracking-[0.06em] text-slate-500'
/** The phone home's tiles: three across, straight on the page (M1). */
export const TILE_GRID = 'grid grid-cols-3 gap-x-2.5 gap-y-3.5'

export default function CategoryTiles({ communitySlug, listings }: { communitySlug: string; listings: readonly DirectoryResource[] | null }) {
  const { categories, sections, counts } = useBrowseCards(communitySlug, listings)
  if (sections === null) {
    return (
      <div aria-hidden="true" className={TILE_GRID}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }
  const cards = mostListedFirst(sections.flatMap((s) => s.cards), counts)
  return (
    <section data-testid="category-tiles" aria-labelledby="category-tiles-title">
      <h2 id="category-tiles-title" className={HOME_LABEL}>Explore by Category</h2>
      <ul className={TILE_GRID}>
        {cards.map((card) => {
          const cats = (categories ?? []) as CategoryConfig[]
          const photo = getCategoryTilePhoto(cats, card.id)
          const color = getCategoryColor(cats, card.id ?? '')
          return (
            <li key={card.id ?? card.title} className="min-w-0">
              <CategoryTile card={card} photo={photo} color={color} />
            </li>
          )
        })}
      </ul>
      <BrowseFoot communitySlug={communitySlug} />
    </section>
  )
}

/** One tile (board R3): the category's picture, or its tint when it has
 *  none, and its name under it in dark text. */
export function CategoryTile({ card, photo, color }: { card: CardDef; photo: string | null | undefined; color: string }) {
  return (
    <Link href={card.href} prefetch={false} className="block min-w-0">
      <span
        aria-hidden="true"
        data-testid="tile-picture"
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl"
        style={{ backgroundColor: photo ? '#e2e8f0' : categoryTint(color) }}
      >
        {photo && <TilePhoto src={photo} px={160} sizes="120px" />}
      </span>
      {/* In flow under the picture: a long name ("Candle Lighting &
          Zmanim") takes a second line rather than being cut off. */}
      <span data-testid="tile-name" className="mt-1.5 block text-[0.84375rem] font-bold leading-tight text-ink">
        {card.title}
      </span>
    </Link>
  )
}
