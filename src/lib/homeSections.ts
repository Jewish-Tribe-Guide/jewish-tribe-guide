// A named group of cards on the home screen (e.g. "Food Establishments"),
// admin-editable via the Sections tab in /admin (now folded into the Home
// page tab — see SiteSettingsEditor.tsx). Replaces the old hardcoded
// HOME_SECTIONS constant in src/components/home/sections.tsx.
export type HomeSection = {
  id: string
  title: string
  sortOrder: number
  /** Ordered CardDef ids (category slugs, or fixed ids like 'support', 'map',
   *  'medical') — which cards belong here, and in what order. */
  cardIds: string[]
}

/** The Home page tab's in-progress, unsaved copy of a section — order is
 *  implied by array position (no `sortOrder` yet), and `id` may be a
 *  temporary client-only placeholder (see `NEW_SECTION_PREFIX`) for a
 *  section that doesn't exist on the server yet. */
export type DraftHomeSection = Pick<HomeSection, 'id' | 'title' | 'cardIds'>

/** Prefix marking a draft section's id as client-only (not yet created on the
 *  server) — see saveHomeSections in homeSectionsDraft.ts, which creates a
 *  real row and swaps in its real id/slug on save. */
export const NEW_SECTION_PREFIX = 'new:'

export function newDraftSectionId(): string {
  return `${NEW_SECTION_PREFIX}${crypto.randomUUID()}`
}
