// A named group of cards on the home screen (e.g. "Food Establishments"),
// admin-editable via the Sections tab in /admin (now folded into the Home
// page tab — see SiteSettingsEditor.tsx). Replaces the old hardcoded
// HOME_SECTIONS constant in src/components/home/sections.tsx.
//
// `kind` widens this from "just titled category groups" to the desktop home
// screen's full block order — a plain named section (kind 'section', the
// original and by far the most common case) sits in the SAME ordered list as
// three singleton built-in blocks: the featured-cards row, the embedded map,
// and the Zmanim & Shabbos band. Reordering/toggling any of them is just
// reordering/removing a row in this same list — see HomeSectionManager.tsx
// and Landing.tsx's ordered block walk.
export type HomeBlockKind = 'section' | 'featured' | 'map' | 'zmanim'

/** The three singleton built-ins' fixed identity — id doubles as `kind` (there
 *  can only ever be one of each), and the title is fixed/not admin-editable
 *  (unlike a plain section's title). Order here is just documentation; actual
 *  display order always comes from sortOrder. */
export const BUILT_IN_BLOCKS: Record<Exclude<HomeBlockKind, 'section'>, { id: string; title: string }> = {
  featured: { id: 'featured', title: 'Popular right now' },
  map: { id: 'map', title: 'Explore the map' },
  zmanim: { id: 'zmanim', title: 'Zmanim & Shabbos' },
}

export type HomeSection = {
  id: string
  kind: HomeBlockKind
  /** Ignored for a built-in block (BUILT_IN_BLOCKS' title always wins) —
   *  only a plain section's title is real, admin-set data. */
  title: string
  sortOrder: number
  /** Ordered CardDef ids (category slugs, or fixed ids like 'support', 'map',
   *  'medical') — which cards belong here, and in what order. Always empty
   *  for a built-in block; they aren't card groups. */
  cardIds: string[]
}

/** The Home page tab's in-progress, unsaved copy of a section — order is
 *  implied by array position (no `sortOrder` yet), and `id` may be a
 *  temporary client-only placeholder (see `NEW_SECTION_PREFIX`) for a
 *  section that doesn't exist on the server yet. */
export type DraftHomeSection = Pick<HomeSection, 'id' | 'kind' | 'title' | 'cardIds'>

/** Prefix marking a draft section's id as client-only (not yet created on the
 *  server) — see saveHomeSections in homeSectionsDraft.ts, which creates a
 *  real row and swaps in its real id/slug on save. Only ever used for plain
 *  sections — a built-in block's id is always its own fixed kind (see
 *  BUILT_IN_BLOCKS), never one of these placeholders. */
export const NEW_SECTION_PREFIX = 'new:'

export function newDraftSectionId(): string {
  return `${NEW_SECTION_PREFIX}${crypto.randomUUID()}`
}
