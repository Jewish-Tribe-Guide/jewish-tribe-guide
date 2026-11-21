import { getAdminClient } from './supabase/admin'
import { listingSlug } from './listingSlug'
import { FIXED_VIEW_KINDS } from './routes'

// ─────────────────────────────────────────────────────────────────────────────
// Which addresses are real, for the proxy to answer 404 on the rest (Nov 21).
//
// With Partial Prefetching on, an address that wasn't prerendered is sent
// the route's prerendered shell at once, and with it a 200. The page still
// finds the address isn't real and says "Page not found", but too late to
// change the status: crawlers and link previews take a dead link for a real
// page. Next's answer (docs: streaming, "The HTTP contract") is the proxy,
// which runs before anything renders. So the proxy needs to know what's real:
// every community, its categories and forms, and each listing category's
// approved listings. That's one small read of four tables, cached in-process
// (see the proxy), never a read per request.
//
// It errs towards letting a request through. A hidden category or an
// unpublished form gets past (the page then 404s as before, with a 200), and
// so does everything when the list has never loaded. Turning a real page
// away is the mistake it must not make.
// ─────────────────────────────────────────────────────────────────────────────

export type KnownAddresses = {
  communities: Set<string>
  /** `community/slug`: a category or a form. */
  slugs: Set<string>
  /** `community/category/listing`, by its friendly slug and by its bare id. */
  listings: Set<string>
}

export const NO_ADDRESSES: KnownAddresses = { communities: new Set(), slugs: new Set(), listings: new Set() }

/** First segments that aren't a community: src/app's own folders, the files
 *  in public/, and Next's and Vercel's own paths. A new one goes here, or the
 *  proxy turns it away (knownAddresses.test.ts checks src/app and public/). */
export const TOP_LEVEL = new Set([
  'admin', 'api', 'icons', 'inbox', 'offline', 'subscribers',
  'images', 'sw.js',
  'robots.txt', 'sitemap.xml', 'manifest.webmanifest',
  '_next', '_vercel',
])

/** Second segments that are screens of a community's own, not a category:
 *  src/app/[community]'s folders, and the addresses next.config.ts rewrites
 *  or redirects there (`admin`, `inbox`, `pinned`). */
export const COMMUNITY_SCREENS = new Set([
  'about', 'ask', 'browse', 'changes', 'feedback', 'map', 'privacy', 'you',
  'admin', 'inbox', 'pinned',
])

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Whether a page address could be real. Deeper than any route goes is left
 *  to the router, which 404s it properly (no route matches, nothing renders). */
export function isKnownAddress(pathname: string, known: KnownAddresses): boolean {
  const parts = pathname.split('/').slice(1).filter(Boolean).map(decode)
  if (parts.length === 0) return true
  const [community, slug, id] = parts
  if (TOP_LEVEL.has(community)) return true
  if (!known.communities.has(community)) return false
  if (slug === undefined || COMMUNITY_SCREENS.has(slug)) return true
  if (FIXED_VIEW_KINDS[slug]) return parts.length === 2
  if (!known.slugs.has(`${community}/${slug}`)) return false
  if (id === undefined) return true
  if (parts.length > 3) return true
  return known.listings.has(`${community}/${slug}/${id}`)
}

const PAGE = 1000

/** Every address the site has, from the database. Throws on a failed read,
 *  so the loader keeps its last good copy rather than a partial one. */
export async function loadKnownAddresses(): Promise<KnownAddresses> {
  const db = getAdminClient()
  const [communities, categories, forms] = await Promise.all([
    db.from('community').select('slug'),
    db.from('category').select('community_id, id, kind'),
    db.from('form').select('community_id, id'),
  ])
  for (const r of [communities, categories, forms]) if (r.error) throw r.error

  const listings: { id: string; name: string; category: string; community_id: string }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('resource')
      .select('id, name, category, community_id')
      .eq('status', 'approved')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    listings.push(...((data ?? []) as typeof listings))
    if (!data || data.length < PAGE) break
  }

  const known: KnownAddresses = { communities: new Set(), slugs: new Set(), listings: new Set() }
  for (const c of (communities.data ?? []) as { slug: string }[]) known.communities.add(c.slug)
  for (const c of (categories.data ?? []) as { community_id: string; id: string }[]) known.slugs.add(`${c.community_id}/${c.id}`)
  for (const f of (forms.data ?? []) as { community_id: string; id: string }[]) known.slugs.add(`${f.community_id}/${f.id}`)
  for (const l of listings) {
    known.listings.add(`${l.community_id}/${l.category}/${listingSlug(l)}`)
    known.listings.add(`${l.community_id}/${l.category}/${l.id}`)
  }
  return known
}
