import type { CategoryConfig } from '@/lib/categories'

// A category's colour is stored on the category (CategoryConfig.pinColor,
// editable in the category editor). Shared by the map (pins, NearbyList) and
// the category-tab listing cards (icon avatar) so the same place always reads
// as the same colour everywhere.
//
// The positional palette below is now only the FALLBACK, for a category with
// nothing stored yet. It used to be the whole mechanism, and the reason that
// changed is worth keeping: the colour was derived from a category's index in
// the active list sorted by plural label, so renaming a category moved it
// alphabetically and silently changed both its own colour and that of every
// category it passed; hiding one shifted everything after it; and production
// and the test project, having different category lists, drew different
// coloured pins from identical code. Colour is identity here — teal means
// Grocery — and identity cannot depend on what a neighbouring row is called.
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

/** This category's colour: the one stored on it, or — for a category that has
 *  never had one set — the positional fallback described above. Falls back to
 *  a neutral slate when the category isn't found at all (categories still
 *  loading, or a stale/deleted id), since a missing colour renders an
 *  invisible pin, which reads as a broken map rather than as loading. */
export function getCategoryColor(categories: CategoryConfig[] | null | undefined, categoryId: string): string {
  const list = categories ?? []
  const index = list.findIndex((c) => c.id === categoryId)
  if (index === -1) return FALLBACK_COLOR
  const stored = list[index].pinColor?.trim()
  return stored || PALETTE[index % PALETTE.length]
}

/** The palette offered in the category editor's colour picker. Exported so the
 *  admin shows the same twenty the fallback draws from, rather than a second
 *  hand-maintained list that can drift from it. */
export const PIN_COLORS: readonly string[] = PALETTE

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

/** Whether a value is a colour this app will store for a pin. Deliberately
 *  strict — a six-digit hex and nothing else. The value ends up in an inline
 *  `style` on the map pin and the listing avatar, so anything looser is both a
 *  rendering risk and a way to end up with an invisible pin. Empty/null is
 *  handled by the caller and means "no colour chosen". */
export function isValidPinColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

/** One category already occupying a colour — enough for the picker to name it
 *  and draw its glyph. */
export type ColorUser = { id: string; label: string; icon: string; automatic: boolean }

/** Which categories currently resolve to each colour, keyed by lowercase hex.
 *
 *  For the editor's swatch row: picking a colour blind is how two categories
 *  end up indistinguishable on the map, and the admin had no way to see it
 *  short of opening the preview and comparing pins by eye.
 *
 *  Resolved through getCategoryColor rather than read off `pinColor`, so a
 *  category still on "Automatic" counts as occupying whatever the positional
 *  palette gives it — that colour is just as taken on the map as an explicit
 *  one. `automatic` says which it was, since a clash with an automatic colour
 *  is the softer kind: it moves on its own when the list changes.
 *
 *  Only `listing` categories, and only visible ones: the pseudo-categories
 *  (map/zmanim/eruv/medical) draw no pins or avatars, and a hidden category is
 *  not on the map to clash with. */
export function categoryColorUsage(
  categories: CategoryConfig[] | null | undefined,
  excludeId?: string,
): Map<string, ColorUser[]> {
  const usage = new Map<string, ColorUser[]>()
  for (const c of categories ?? []) {
    if (c.kind !== 'listing' || c.active === false) continue
    if (excludeId && c.id === excludeId) continue
    const key = getCategoryColor(categories, c.id).toLowerCase()
    const user: ColorUser = {
      id: c.id,
      label: c.pluralLabel,
      icon: c.icon,
      automatic: !c.pinColor?.trim(),
    }
    const existing = usage.get(key)
    if (existing) existing.push(user)
    else usage.set(key, [user])
  }
  return usage
}
