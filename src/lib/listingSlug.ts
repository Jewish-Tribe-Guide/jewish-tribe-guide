import type { DirectoryResource } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// The URL segment for one listing — /philly/grocery/goldi-a1b2c3, not the bare
// Supabase uuid a link like that used to carry. The name half is what makes
// the link worth sending (and worth a search engine indexing); the id suffix
// makes it collision-free without having to know about any other listing in
// the category, so it can be computed from a single item wherever one is in
// hand — a directory card, a map pin, the sitemap — with no sibling lookup.
// ─────────────────────────────────────────────────────────────────────────────

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function listingSlug(item: Pick<DirectoryResource, 'id' | 'name'>): string {
  const base = slugifyName(item.name)
  const suffix = item.id.replace(/-/g, '').slice(0, 6)
  return base ? `${base}-${suffix}` : suffix
}

/** Finds the listing a `[id]` route segment refers to. Tries the friendly
 *  slug first, then falls back to a bare id — a link built before this slug
 *  existed (e.g. the map's "View listing" action, which still routes on the
 *  raw listing id) keeps resolving. */
export function resolveListing(
  items: DirectoryResource[],
  param: string,
): DirectoryResource | undefined {
  return items.find((item) => listingSlug(item) === param) ?? items.find((item) => item.id === param)
}
