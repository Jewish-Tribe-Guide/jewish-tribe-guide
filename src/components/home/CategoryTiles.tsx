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

/** The phone home's label over a box (Right now, Explore by Category):
 *  small, grey, capitals. */
export const HOME_LABEL = 'mb-2 text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-slate-500'
/** The phone home's white box, Right now's and the tiles' alike. */
export const TILE_BOX = 'rounded-2xl border border-slate-200 bg-white p-2.5'

export default function CategoryTiles({ communitySlug, listings }: { communitySlug: string; listings: readonly DirectoryResource[] | null }) {
  const { categories, sections, counts } = useBrowseCards(communitySlug, listings)
  if (sections === null) {
    return (
      <div aria-hidden="true" className={`${TILE_BOX} grid grid-cols-3 gap-2`}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }
  const cards = mostListedFirst(sections.flatMap((s) => s.cards), counts)
  return (
    <section data-testid="category-tiles" aria-labelledby="category-tiles-title">
      <h2 id="category-tiles-title" className={HOME_LABEL}>Explore by Category</h2>
      <ul className={`${TILE_BOX} grid grid-cols-3 gap-2`}>
        {cards.map((card) => {
          const cats = (categories ?? []) as CategoryConfig[]
          const photo = getCategoryTilePhoto(cats, card.id)
          const color = getCategoryColor(cats, card.id ?? '')
          return (
            <li key={card.id ?? card.title} className="flex min-w-0">
              {/* aspect-square with the name in flow: a name longer than
                  the square has room for makes its tile (and row) taller
                  rather than cut off (Oct 20: "Candle Lighting & Zmanim"
                  lost its last word). */}
              <Link
                href={card.href}
                prefetch={false}
                className="relative flex aspect-square w-full items-center justify-center rounded-xl p-1.5 text-center"
                style={photo ? { backgroundColor: '#475569' } : { backgroundColor: categoryTint(color) }}
              >
                {photo && (
                  // Clipped here, not on the tile: a box that hides its
                  // overflow can't grow past its aspect ratio.
                  <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-xl">
                    <TilePhoto src={photo} px={120} sizes="120px" />
                    <span className="absolute inset-0 bg-slate-900/45" />
                  </span>
                )}
                <span
                  data-testid="tile-name"
                  className={`relative text-[14px] font-extrabold leading-tight ${photo ? 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]' : 'text-ink'}`}
                >
                  {card.title}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <BrowseFoot communitySlug={communitySlug} />
    </section>
  )
}
