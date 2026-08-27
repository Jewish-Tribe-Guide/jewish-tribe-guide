import type { CategoryConfig } from '@/lib/categories'

// Categories don't carry their own color — it's assigned by position in the
// shared category list so every category gets a distinct, stable color
// without an admin having to pick one. Shared by the map (pins, NearbyList)
// and the category-tab listing cards (icon avatar) so the same place always
// reads as the same color everywhere.
// Each entry is the Tailwind-600 hue it's named for, pulled back in OKLCH:
// chroma x0.80 and lightness -0.06. A category directory shows one of these at
// a time and could carry the raw -600s fine; the map shows a hundred and fifty
// at once, stacked, and at full chroma that reads as noise rather than as
// information. Reducing chroma rather than lightening keeps the hues far
// enough apart to still tell a green pin from a teal one, and dropping
// lightness raises the contrast of the white glyph sitting on top of every one
// of them (the amber was the worst at 2.9:1 against white and is now 3.7:1).
// Derived, not hand-picked, so a future palette entry can be generated the
// same way instead of eyeballed against the rest.
const PALETTE = [
  '#2657bf', // blue
  '#2c8c47', // green
  '#7a36bf', // purple
  '#c55526', // orange
  '#257d96', // cyan
  '#b63167', // pink
  '#ad7c29', // amber
  '#423fb8', // indigo
  '#267e75', // teal
  '#5d8d28', // lime
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

/** The faint fill behind a category glyph — the same color as the pin, at low
 *  alpha. Every avatar-shaped thing in the app (listing rows, the map's nearby
 *  list, both search-suggestion dropdowns) draws this, and they were four
 *  separate copies of `color + '<hex alpha>'` that had already started to
 *  matter: at the 13% they shared, a directory of 70 listings read as a column
 *  of empty gray circles, and the color that ties a row to its map pin wasn't
 *  doing its job. One function so raising it raises all four together. */
export function categoryTint(color: string): string {
  return color + '2e' // ≈18% alpha
}
