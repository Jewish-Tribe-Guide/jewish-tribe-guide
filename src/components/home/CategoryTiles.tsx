'use client'

import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { getCategoryColor } from '@/lib/categoryColor'
import CategoryIcon from '@/components/CategoryIcon'
import { BrowseFoot, useBrowseCards } from './BrowseAll'

// ── The phone home's categories, as tiles (the user, Oct 17) ────────────────
// The list read as dull: every row alike, three screens of it under six
// headings. Tiles put every category on about one screen, each in its own
// colour: the site's line glyph on its tint, its name, how many places. Not
// the old photo tiles (stock photos, one download each). The admin's order,
// without the group headings; past twelve, the rest are a short line of
// links under them, so a new category never leaves one tile alone in a row.

/** Three rows of three, then one of three more. */
export const TILE_COUNT = 12

export default function CategoryTiles({ communitySlug, listings }: { communitySlug: string; listings: readonly DirectoryResource[] | null }) {
  const { categories, sections, counts } = useBrowseCards(communitySlug, listings)
  if (sections === null) {
    return (
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    )
  }
  const cards = sections.flatMap((s) => s.cards)
  const tiles = cards.slice(0, TILE_COUNT)
  const rest = cards.slice(TILE_COUNT)
  return (
    <div data-testid="category-tiles">
      <ul className="grid grid-cols-3 gap-2">
        {tiles.map((card) => {
          // Only where the card counts something (not a form).
          const n = card.count && card.id ? counts?.[card.id] : undefined
          return (
            <li key={card.id ?? card.title} className="min-w-0">
              <Link
                href={card.href}
                prefetch={false}
                className="flex h-full min-h-[104px] flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-1.5 pt-3 pb-2.5 text-center hover:bg-slate-50"
              >
                <CategoryIcon icon={card.icon ?? ''} categoryId={card.id} color={getCategoryColor((categories ?? []) as CategoryConfig[], card.id ?? '')} className="h-10 w-10 text-lg" sizePx={40} />
                <span className="line-clamp-2 text-[13.5px] font-bold leading-tight text-ink">{card.title}</span>
                {n !== undefined && <span className="text-[12px] tabular-nums text-slate-500">{n}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
      {rest.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-1 text-[14px] text-slate-500">
          <span className="mr-1">Also:</span>
          {rest.map((card, i) => (
            <span key={card.id ?? card.title}>
              <Link href={card.href} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-ink hover:underline">
                {card.title}
              </Link>
              {i < rest.length - 1 && <span aria-hidden="true">,</span>}
            </span>
          ))}
        </p>
      )}
      <BrowseFoot communitySlug={communitySlug} />
    </div>
  )
}
