// ─────────────────────────────────────────────────────────────────────────────
// The site's URL shape.
//
//   /                        → redirects to the default community
//   /philly                  → home
//   /philly/all              → the full category index
//   /philly/map              → the map
//   /philly/feedback         → the feedback form
//   /philly/grocery          → a category directory, or a form wizard
//   /philly/grocery/abc123   → one listing
//
// Community lives in the path rather than localStorage or a query param so a
// link always names the community it shows. A link sent in a WhatsApp group
// has to open the same directory for everyone who taps it, whatever community
// their own device last looked at.
//
// Category and form slugs sit directly under the community with no `/c/`
// namespace segment. They already share one namespace in the UI (a mobile tab
// target resolves as a category first, then as a form), the set is small and
// admin-curated rather than open user content, and `/philly/grocery` is a
// better link to read and to index than `/philly/c/grocery`. The cost is that a
// slug could collide with one of the fixed screens below, which RESERVED_SLUGS
// prevents at the point a category or form is created.
// ─────────────────────────────────────────────────────────────────────────────

import type { CategoryKind } from './categories'

/** The three cards (see resourceCards in home/sections.tsx) that open a fixed,
 *  hand-built screen rather than a normal listing directory — About Your
 *  Hospital, Eruv Information, Zmanim & Shabbos (see FindResources). Their URL
 *  slug is one of these literals, permanently, regardless of what an admin
 *  names the matching category — that category only supplies display text
 *  (its pluralLabel/description), the same way a card's label can be edited
 *  without moving what it links to.
 *
 *  This used to not matter: which screen was open lived in in-memory state,
 *  never a real URL, so nothing ever compared a category's slug against these
 *  literals. Giving every screen a shareable URL turned that into a real
 *  lookup — see resolveSlug in [slug]/page.tsx — and a category's slug is
 *  derived from its label (see createCategory), so "Eruv Information" became
 *  `eruv-information`, not `eruv`. The card kept linking to `/eruv`; nothing
 *  was ever there to resolve it. This map is what makes `/eruv` resolve to the
 *  eruv-kind category regardless of what that category's own slug is. */
export const FIXED_VIEW_KINDS: Record<string, CategoryKind> = {
  hospitals: 'medical',
  eruv: 'eruv',
  zmanim: 'zmanim',
}

/** Slugs a category or form may never take, because a route already owns them.
 *  Enforced when an admin creates or renames one — see assertUsableSlug. */
export const RESERVED_SLUGS = new Set([
  // Screens under /[community].
  'all',
  'map',
  'feedback',
  // The fixed views above — a listing category named "Eruv" would otherwise
  // shadow the real Eruv Information screen at the same URL.
  ...Object.keys(FIXED_VIEW_KINDS),
  // Top-level routes that would otherwise look like a community.
  'admin',
  'inbox',
  'api',
  // The service worker's offline fallback, and the worker itself.
  'offline',
  'sw.js',
  // Generated app icons.
  'icons',
  // Framework and metadata paths.
  '_next',
  'favicon.ico',
  'manifest.webmanifest',
  'sitemap.xml',
  'robots.txt',
  'opengraph-image',
])

/** Why a slug can't be used, or null when it's fine. Checked by the admin
 *  category/form editors before saving, so a reserved slug is rejected at the
 *  point of creation rather than silently shadowing a real screen. */
export function slugRejectionReason(slug: string): string | null {
  const s = slug.trim().toLowerCase()
  if (!s) return 'A URL slug is required.'
  if (RESERVED_SLUGS.has(s)) {
    return `"${s}" is reserved for a built-in page. Please choose another name.`
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) {
    return 'A URL slug may only contain lowercase letters, numbers and hyphens.'
  }
  return null
}

/** Throws if a slug can't be used as a URL segment. For server-side callers
 *  (the category/form write paths) that need to fail loudly. */
export function assertUsableSlug(slug: string): void {
  const reason = slugRejectionReason(slug)
  if (reason) throw new Error(reason)
}

// ── URL builders ─────────────────────────────────────────────────────────────
// Every link in the app goes through these rather than composing paths inline,
// so the URL shape stays changeable from one file.

export const routes = {
  home: (community: string) => `/${community}`,
  allCategories: (community: string) => `/${community}/all`,
  map: (community: string) => `/${community}/map`,
  feedback: (community: string) => `/${community}/feedback`,
  /** A category directory or a form wizard — they share this namespace. */
  slug: (community: string, slug: string) => `/${community}/${slug}`,
  listing: (community: string, slug: string, listingId: string) =>
    `/${community}/${slug}/${listingId}`,
}

/** Serializes the map's live view into query params, so a shared map link
 *  reopens the same pins and filters. Omits anything at its default rather than
 *  writing an empty value, keeping the common URL short. */
export function mapQueryString(state: {
  categories?: string[] | null
  query?: string | null
  openNow?: boolean
  bool?: string[] | null
  select?: Record<string, string[]> | null
}): string {
  const params = new URLSearchParams()
  if (state.categories?.length) params.set('cat', state.categories.join(','))
  if (state.query) params.set('q', state.query)
  if (state.openNow) params.set('open', '1')
  if (state.bool?.length) params.set('is', state.bool.join(','))
  if (state.select && Object.keys(state.select).length) {
    // key:v1|v2 pairs, comma separated — readable and safe in a URL.
    params.set(
      'sel',
      Object.entries(state.select)
        .map(([k, vs]) => `${k}:${vs.join('|')}`)
        .join(','),
    )
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Reads back what mapQueryString wrote. Tolerant of junk — a malformed param
 *  yields the default rather than throwing, since these arrive from user-edited
 *  URLs and old links. */
export function parseMapQuery(params: URLSearchParams): {
  categories: string[] | null
  query: string | null
  openNow: boolean
  bool: string[] | null
  select: Record<string, string[]> | null
} {
  const list = (v: string | null) => {
    const items = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return items.length ? items : null
  }

  const rawSelect = params.get('sel')
  let select: Record<string, string[]> | null = null
  if (rawSelect) {
    const entries = rawSelect
      .split(',')
      .map((pair) => pair.split(':'))
      .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])
      .map(([k, vs]) => [k, vs.split('|').filter(Boolean)] as const)
      .filter(([, vs]) => vs.length > 0)
    if (entries.length) select = Object.fromEntries(entries)
  }

  return {
    categories: list(params.get('cat')),
    query: params.get('q') || null,
    openNow: params.get('open') === '1',
    bool: list(params.get('is')),
    select,
  }
}
