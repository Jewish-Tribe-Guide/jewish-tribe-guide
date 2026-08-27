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
//
// The second block is the same ten hues again, darker. It exists because
// `index % PALETTE.length` wraps: with ten colours and sixteen categories the
// eleventh category got the first one's colour byte-for-byte, and Restaurants
// and Synagogues — #257d96 both — were genuinely indistinguishable on the map.
// Twenty entries pushes that wrap past any category count this app will see.
//
// The dark block is ROTATED BY FIVE, and that is the point of it rather than a
// tidiness detail. Listed in the same hue order as the first block, entry n and
// entry n+10 are one hue at two lightnesses — the least distinguishable pair a
// palette can produce — and that reproduced the original bug almost exactly:
// Restaurants (index 4) and Synagogues (index 14) came out cyan and dark cyan,
// still a matched pair at a glance. Rotating by half the block puts n and n+10
// on opposite sides of the hue circle, so the two categories most likely to
// collide are now the two furthest apart (0.167 in OKLab, against a 0.087
// worst case across all ten such pairs). Same twenty colours either way; only
// the assignment moves.
//
// What twenty entries does NOT do is make twenty categories easy to tell apart,
// and it's worth writing that down rather than rediscovering it. Measured in
// OKLab, the closest pair among the original ten is green/lime at 0.047, then
// cyan/teal at 0.054 — already near-twins before any of this. A second tier
// holds that same 0.047 floor rather than worsening it, and that is the most
// that's available: every attempt at more distinct colours (evenly-spaced
// hues, more tiers, a wider gamut) trades against either the white glyph's
// contrast or the separation of the pairs that already exist. Past roughly ten
// categories the GLYPH is what tells two pins apart and colour is a supporting
// cue. If pins ever need to be distinguishable by colour alone, the fix is
// fewer categories on the map, not more entries here.
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
  '#a11956', // dark pink   — index 10, opposite index 0 (blue)
  '#9a6a0d', // dark amber  — index 11, opposite index 1 (green)
  '#352ba4', // dark indigo — index 12, opposite index 2 (purple)
  '#076c64', // dark teal   — index 13, opposite index 3 (orange)
  '#4c7b0d', // dark lime   — index 14, opposite index 4 (cyan)
  '#1544ab', // dark blue   — index 15, opposite index 5 (pink)
  '#117a36', // dark green  — index 16, opposite index 6 (amber)
  '#691fab', // dark purple — index 17, opposite index 7 (indigo)
  '#b1420c', // dark orange — index 18, opposite index 8 (teal)
  '#056b84', // dark cyan   — index 19, opposite index 9 (lime)
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
