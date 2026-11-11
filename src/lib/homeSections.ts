// A named group of cards on the home screen (e.g. "Food Establishments"),
// admin-editable via the Sections tab in /admin (now folded into the Home
// page tab — see SiteSettingsEditor.tsx). Replaces the old hardcoded
// HOME_SECTIONS constant in src/components/home/sections.tsx.
//
// `kind` widens this from "just titled category groups" to the desktop home
// screen's full block order — a plain named section (kind 'section', the
// original and by far the most common case) sits in the SAME ordered list as
// the desktop home screen's singleton built-in blocks, one per card.
// Reordering or removing any of them is just reordering/removing a row in
// this same list — see HomeSectionManager.tsx and Landing.tsx's ordered
// block walk.
//
// 'zmanim' (Davening Times + the community card, paired side-by-side),
// 'shabbat' (Shabbat Times + Stay in the Loop, also paired), and 'featured'
// (the "Popular right now" row) are gone as of this type — each pair split
// into two fully independent cards ('davening'/'listings',
// 'subscribe'/'jewishTimes'), and 'featured' was dropped outright (no
// admin control was ever built for it, and it duplicated what the flat
// "Browse everything" grid already shows). 'map' (the map embedded directly
// on the home screen) retired later, the same way — the map only ever lives
// at its own full-screen route — and came back Nov 11 as a plain card that
// links there (board G3, MapCard.tsx), a photo and words, no map. 'listings'
// retired the same day (the trust band under the hero says it). The DB CHECK
// constraint keeps allowing all of these old values too, though (see the
// migration that added the current set) — DDL here only ever widens, never
// narrows, so an existing row with one of the old kinds doesn't fail to
// load; Landing.tsx's ordered walk just no longer has a branch for it, so it
// silently renders nothing until reseeded (see seed-home-blocks.mjs) or
// removed by hand.
export type HomeBlockKind = 'section' | 'browse' | 'davening' | 'listings' | 'suggest' | 'map' | 'subscribe' | 'jewishTimes'

/** The built-ins' fixed identity — id doubles as `kind` (there can only ever
 *  be one of each). `title` is only ever used as this row's fallback label
 *  in the admin's own "+ Add" button and DB default — the cards offered
 *  are DesktopTopicsManager's CARD_KINDS ('listings' is a member here for
 *  legacy-row compatibility only); none renders its `title` the way the old
 *  'featured'/'zmanim' did.
 *  Order here is just documentation; actual display order always comes from
 *  sortOrder. */
export const BUILT_IN_BLOCKS: Record<Exclude<HomeBlockKind, 'section'>, { id: string; title: string }> = {
  browse: { id: 'browse', title: 'Categories Card' },
  davening: { id: 'davening', title: 'Davening Times Card' },
  listings: { id: 'listings', title: 'Update Listings Card' },
  suggest: { id: 'suggest', title: 'Suggest a Listing Card' },
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
  /** Desktop only, and only for a built-in card: true puts it in the row of
   *  the card before it (cardRows below). */
  sharesRow: boolean
}

/** The Home page tab's in-progress, unsaved copy of a section — order is
 *  implied by array position (no `sortOrder` yet), and `id` may be a
 *  temporary client-only placeholder (see `NEW_SECTION_PREFIX`) for a
 *  section that doesn't exist on the server yet. */
export type DraftHomeSection = Pick<HomeSection, 'id' | 'kind' | 'title' | 'cardIds' | 'sharesRow'>

/** Prefix marking a draft section's id as client-only (not yet created on the
 *  server) — see saveHomeSections in homeSectionsDraft.ts, which creates a
 *  real row and swaps in its real id/slug on save. Only ever used for plain
 *  sections — a built-in block's id is always its own fixed kind (see
 *  BUILT_IN_BLOCKS), never one of these placeholders. */
export const NEW_SECTION_PREFIX = 'new:'

export function newDraftSectionId(): string {
  return `${NEW_SECTION_PREFIX}${crypto.randomUUID()}`
}

// The computer home's cards in rows (the user, Nov 4; drawn as artifact
// 8HpeQANzsQyGbyHVPsXrc5): a card sharing the row of the one before it joins
// that row, up to three; Categories and the map card always have a row to
// themselves. One card fills its row, two split it, three take a third
// each. Pure.

export const MAX_CARDS_IN_ROW = 3

/** The cards that always fill a row: Categories, and the map card, whose
 *  photo and words sit side by side (board G3). */
export const ROW_OF_ITS_OWN: ReadonlySet<string> = new Set(['browse', 'map'])

type RowCard = { kind: string; sharesRow: boolean }

/** Whether `card` can join `row`. */
export function canShareRow(row: readonly RowCard[], card: RowCard): boolean {
  return row.length < MAX_CARDS_IN_ROW && !ROW_OF_ITS_OWN.has(card.kind) && !row.some((c) => ROW_OF_ITS_OWN.has(c.kind))
}

/** The cards, in order, as rows. */
export function cardRows<T extends RowCard>(cards: readonly T[]): T[][] {
  const rows: T[][] = []
  for (const card of cards) {
    const last = rows.at(-1)
    if (card.sharesRow && last && canShareRow(last, card)) last.push(card)
    else rows.push([card])
  }
  return rows
}

/** Rows back to cards in order, each saying whether it shares a row. */
export function fromCardRows<T extends RowCard>(rows: readonly (readonly T[])[]): T[] {
  return rows.flatMap((row) => row.map((card, i) => ({ ...card, sharesRow: i > 0 })))
}
