'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { categoryTint, getCategoryColor, getCategoryTilePhoto } from '@/lib/categoryColor'
import { CategoryGlyph } from '@/lib/categoryIcons'
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

export default function CategoryTiles({ communitySlug, listings }: { communitySlug: string; listings: readonly DirectoryResource[] | null }) {
  const { categories, sections, counts } = useBrowseCards(communitySlug, listings)
  if (sections === null) {
    return (
      <div aria-hidden="true" className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }
  const cards = mostListedFirst(sections.flatMap((s) => s.cards), counts)
  return (
    <div data-testid="category-tiles">
      <ul className="grid grid-cols-3 gap-2.5">
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
                className="relative flex aspect-square w-full flex-col justify-between rounded-xl p-2"
                style={photo ? { backgroundColor: '#e2e8f0' } : { backgroundColor: categoryTint(color) }}
              >
                {photo ? (
                  <>
                    {/* Clipped here, not on the tile: a box that hides its
                        overflow can't grow past its aspect ratio. */}
                    <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-xl">
                      <TilePhoto src={photo} px={120} sizes="120px" />
                      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0)_35%,rgba(15,23,42,0.78)_100%)]" />
                    </span>
                    <span />
                  </>
                ) : (
                  <span aria-hidden="true" className="flex justify-center pt-1" style={{ color: `color-mix(in oklab, ${color} 70%, #000)` }} data-testid="tile-glyph">
                    <CategoryGlyph categoryId={card.id} className="h-8 w-8" />
                  </span>
                )}
                <span data-testid="tile-name" className={`relative mt-1 text-[13.5px] font-bold leading-tight ${photo ? 'text-white' : 'text-ink'}`}>
                  {card.title}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <BrowseFoot communitySlug={communitySlug} />
    </div>
  )
}
