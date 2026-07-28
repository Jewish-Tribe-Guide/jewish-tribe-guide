import type { CategoryConfig } from '@/lib/categories'

// Categories don't carry their own color — it's assigned by position in the
// shared category list so every category gets a distinct, stable color
// without an admin having to pick one. Shared by the map (pins, NearbyList)
// and the category-tab listing cards (icon avatar) so the same place always
// reads as the same color everywhere.
const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // amber
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#65a30d', // lime
]

const FALLBACK_COLOR = '#64748b'

/** The color assigned to `categoryId` by its position in `categories` — same
 *  algorithm the map uses, so a category's listing-card icon and its map pin
 *  always match. Falls back to a neutral slate when the category isn't found
 *  (categories still loading, or a stale/deleted id). */
export function getCategoryColor(categories: CategoryConfig[] | null | undefined, categoryId: string): string {
  const index = (categories ?? []).findIndex((c) => c.id === categoryId)
  return index === -1 ? FALLBACK_COLOR : PALETTE[index % PALETTE.length]
}
