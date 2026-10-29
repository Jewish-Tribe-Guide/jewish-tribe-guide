// What kind of place a category holds (the admin redesign's brief, question
// 8): Shuls, Food, Groceries, Mikvahs, Hotels, Hospitals, or Plain. A kind
// is picked when a category is made, and the things that used to follow
// Philly's slugs follow it instead: the line icon, the hidden search words
// and the schema.org type. Shul times and menus already follow a category's
// fields (a minyanim field, a list of dishes), not its slug.
//
// A category with no kind saved (every category before migration 088, and
// any database without it) takes its kind from its slug, so Philly's
// categories keep exactly what they had.

export const PLACE_KINDS = ['shuls', 'food', 'groceries', 'mikvahs', 'hotels', 'hospitals', 'plain'] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

export const PLACE_KIND_INFO: Record<PlaceKind, { label: string; line: string; template?: string }> = {
  shuls: { label: 'Shuls', line: 'Davening times, every weekday and Shabbos', template: 'synagogue' },
  food: { label: 'Food', line: 'Menus, kosher lists and main dishes', template: 'restaurant' },
  groceries: { label: 'Groceries', line: 'Kosher items and hours', template: 'grocery' },
  mikvahs: { label: 'Mikvahs', line: 'Hours, appointments and keilim', template: 'mikvah' },
  hotels: { label: 'Hotels', line: 'Shabbos-friendly stays and shuttles', template: 'hotel' },
  hospitals: { label: 'Hospitals', line: 'Chaplains, Shabbos rooms and kosher food' },
  plain: { label: 'Plain', line: 'A list of places, with the fields you choose' },
}

/** Each kind's key in the id-keyed tables (icons, search words, schema
 *  types), which were written against Philly's slugs. */
const KIND_KEY: Record<Exclude<PlaceKind, 'plain'>, string> = {
  shuls: 'synagogue',
  food: 'restaurant',
  groceries: 'grocery',
  mikvahs: 'mikvah',
  hotels: 'hotel',
  hospitals: 'hospital',
}

/** Slugs that mean a kind: Philly's, and their plain plurals. */
const KIND_BY_SLUG: Record<string, PlaceKind> = {
  synagogue: 'shuls',
  synagogues: 'shuls',
  shul: 'shuls',
  shuls: 'shuls',
  restaurant: 'food',
  restaurants: 'food',
  food: 'food',
  grocery: 'groceries',
  groceries: 'groceries',
  mikvah: 'mikvahs',
  mikvahs: 'mikvahs',
  mikveh: 'mikvahs',
  hotel: 'hotels',
  hotels: 'hotels',
  hospital: 'hospitals',
  hospitals: 'hospitals',
}

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === 'string' && (PLACE_KINDS as readonly string[]).includes(value)
}

/** The kind a category's slug implies, for a category with none saved. */
export function placeKindFromSlug(id: string): PlaceKind {
  return KIND_BY_SLUG[id] ?? 'plain'
}

/** The key a category's icon, search words and schema type are found by:
 *  its kind's, or its own id for a Plain one (so Plain categories with a
 *  drawn icon of their own, like Schools, keep it). */
export function kindKey(category: { id: string; placeKind?: PlaceKind }): string {
  const kind = category.placeKind ?? placeKindFromSlug(category.id)
  return kind === 'plain' ? category.id : KIND_KEY[kind]
}

/** kindKey for a category known only by id, looked up in `categories`. */
export function kindKeyById(id: string, categories: readonly { id: string; placeKind?: PlaceKind }[] | null | undefined): string {
  const category = categories?.find((c) => c.id === id)
  return category ? kindKey(category) : id
}
