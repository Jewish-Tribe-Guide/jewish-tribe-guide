import { getAdminClient } from './supabase/admin'
import { listingSlug } from './listingSlug'
import { routes } from './routes'

// ─────────────────────────────────────────────────────────────────────────────
// A listing's link from before it had a friendly one: /philly/grocery/<uuid>.
// Every link the site builds now is /philly/grocery/goldi-a1b2c3, so a bare
// id only arrives from an old shared link or email. It goes to the friendly
// link by a 308 from the proxy, before any render.
//
// Not from the page (Nov 18): a bare id isn't among the prerendered
// listings, so the page renders it on demand, and Next 16.3's on-demand
// prerender writes a redirect's Location twice. The first request for a
// bare id got `Location: /a, /a` as one header, which the browser followed
// to `/a,%20/a`, a 404; later ones got two identical headers. The proxy
// answers with one.
// ─────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BareListingLink = { community: string; category: string; id: string }

/** `/<community>/<category>/<uuid>`, or null for anything else. */
export function parseBareListingLink(pathname: string): BareListingLink | null {
  const parts = pathname.split('/')
  if (parts.length !== 4 || parts[0] !== '') return null
  const [, community, category, id] = parts
  if (!community || !category || !UUID.test(id)) return null
  return { community, category, id }
}

/** The listing's friendly path, when that id is an approved listing in that
 *  community and category; null otherwise (the page then 404s as before). */
export async function friendlyListingPath(link: BareListingLink): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('id, name')
    .eq('id', link.id)
    .eq('community_id', link.community)
    .eq('category', link.category)
    .eq('status', 'approved')
    .maybeSingle()
  if (error || !data) return null
  return routes.listing(link.community, link.category, listingSlug(data as { id: string; name: string }))
}
