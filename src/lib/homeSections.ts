// A named group of cards on the home screen (e.g. "Food Establishments"),
// admin-editable via the Sections tab in /admin (now folded into the Home
// page tab — see SiteSettingsEditor.tsx). Replaces the old hardcoded
// HOME_SECTIONS constant in src/components/home/sections.tsx.
//
// `kind` widens this from "just titled category groups" to the desktop home
// screen's full block order — a plain named section (kind 'section', the
// original and by far the most common case) sits in the SAME ordered list as
// six singleton built-in blocks, one per desktop home-screen card. Reordering
// or removing any of them is just reordering/removing a row in this same
// list — see HomeSectionManager.tsx and Landing.tsx's ordered block walk.
//
// 'zmanim' (Davening Times + the community card, paired side-by-side),
// 'shabbat' (Shabbat Times + Stay in the Loop, also paired), and 'featured'
// (the "Popular right now" row) are gone as of this type — each pair split
// into two fully independent cards ('davening'/'listings',
// 'subscribe'/'jewishTimes'), and 'featured' was dropped outright (no
// admin control was ever built for it, and it duplicated what the flat
// "Browse everything" grid already shows). The DB CHECK constraint keeps
// allowing the old values too, though (see the migration that added the
// current set) — DDL here only ever widens, never narrows, so an existing
// row with one of the old kinds doesn't fail to load; Landing.tsx's ordered
// walk just no longer has a branch for it, so it silently renders nothing
// until reseeded (see seed-home-blocks.mjs) or removed by hand.
export type HomeBlockKind = 'section' | 'browse' | 'davening' | 'listings' | 'map' | 'subscribe' | 'jewishTimes'

/** The six singleton built-ins' fixed identity — id doubles as `kind` (there
 *  can only ever be one of each). `title` is only ever used as this row's
 *  fallback label in the admin's own "+ Add" button and DB default — every
 *  one of these six has its own dedicated eyebrow/heading fields in
 *  SiteSettings now (see DesktopTopicsManager's CARD_META), not a
 *  live-rendered `title` the way the old 'featured'/'map'/'zmanim' did.
 *  Order here is just documentation; actual display order always comes from
 *  sortOrder. */
export const BUILT_IN_BLOCKS: Record<Exclude<HomeBlockKind, 'section'>, { id: string; title: string }> = {
  browse: { id: 'browse', title: 'Categories and Search Card' },
  davening: { id: 'davening', title: 'Davening Times Card' },
  listings: { id: 'listings', title: 'Update Listings Card' },
  map: { id: 'map', title: 'Map Card' },
  subscribe: { id: 'subscribe', title: 'Email Signup Card' },
  jewishTimes: { id: 'jewishTimes', title: 'Jewish Times Card' },
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
