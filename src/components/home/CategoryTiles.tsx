'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import CategoryIcon from '@/components/CategoryIcon'
import { BrowseFoot, useBrowseCards } from './BrowseAll'
import type { CardDef } from './sections'

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

export default function CategoryTiles({ communitySlug, listings }: { communitySlug: string; listings: readonly DirectoryResource[] | null }) {
  const { categories, sections, counts } = useBrowseCards(communitySlug, listings)
  if (sections === null) {
    return (
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    )
  }
  const cards = mostListedFirst(sections.flatMap((s) => s.cards), counts)
  return (
    <div data-testid="category-tiles">
      <ul className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <li key={card.id ?? card.title} className="min-w-0">
            <Link
              href={card.href}
              prefetch={false}
              className="flex h-full min-h-[88px] flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-1.5 pt-3 pb-2.5 text-center hover:bg-slate-50"
            >
              <CategoryIcon icon={card.icon ?? ''} categoryId={card.id} color={getCategoryColor((categories ?? []) as CategoryConfig[], card.id ?? '')} className="h-10 w-10 text-lg" sizePx={40} />
              {/* Three lines, not two: "Candle Lighting & Zmanim" lost its
                  last word at an iPhone's width (Oct 20). A row with a
                  three-line name is a little taller, all its tiles alike. */}
              <span data-testid="tile-name" className="line-clamp-3 text-[13.5px] font-bold leading-tight text-ink">{card.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <BrowseFoot communitySlug={communitySlug} />
    </div>
  )
}
