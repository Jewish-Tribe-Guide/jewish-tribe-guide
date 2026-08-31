import { cacheLife, cacheTag } from 'next/cache'
import { CONFIG_COMMUNITY_SLUG } from './configCommunity'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { community as configCommunity } from '@/community.config'
import { assertUsableSlug } from './routes'
import { isValidPinColor } from './categoryColor'

// ─────────────────────────────────────────────────────────────────────────────
// Communities — the tenant this site is currently showing.
//
// One database, one row per community, `community_id` on every content table
// (see supabase/migrations/20240101000027_communities.sql for why that shape
// rather than a database each). Everything that reads content scopes to one
// community; nothing merges across them.
//
// src/community.config.ts stays the bootstrap: a fresh install with no
// `community` rows yet still renders, using the config as a single implicit
// community. Once rows exist they win. That keeps `npm run setup` working on a
// blank database and means this module never returns an empty list.
// ─────────────────────────────────────────────────────────────────────────────

export type Community = {
  slug: string
  name: string
  shortName: string
  tagline: string
  mission: string
  manifestDescription: string
  region: string
  timezone: string
  mapCenter: { lat: number; lng: number }
  themeColor: string
  backgroundColor: string
  /** Optional-module + UI capability overrides; same shapes as community.config.ts.
   *  Empty objects mean "inherit the config defaults". */
  features: Record<string, unknown>
  ui: Record<string, unknown>
  sortOrder: number
  isDefault: boolean
  /** Whether this community appears on the public switcher (GET
   *  /api/communities) and in sitemap.ts. Direct URLs to its own pages and
   *  admin console work regardless — see the migration's own comment for
   *  why. A superadmin toggles this from CommunityManager once a community
   *  is ready to go live. */
  visible: boolean
}

type Row = {
  slug: string
  name: string
  short_name: string
  tagline: string
  mission: string
  manifest_description: string
  region: string
  timezone: string
  map_center: { lat: number; lng: number } | null
  theme_color: string
  background_color: string
  features: Record<string, unknown> | null
  ui: Record<string, unknown> | null
  sort_order: number
  is_default: boolean
  visible: boolean
}

function toCommunity(row: Row): Community {
  return {
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    tagline: row.tagline,
    mission: row.mission,
    manifestDescription: row.manifest_description,
    region: row.region,
    timezone: row.timezone,
    mapCenter: row.map_center ?? configCommunity.mapCenter,
    themeColor: row.theme_color,
    backgroundColor: row.background_color,
    features: row.features ?? {},
    ui: row.ui ?? {},
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    visible: row.visible,
  }
}

// Re-exported so existing importers keep working; defined in its own module
// so proxy.ts can use it without pulling in the Supabase client.
export { CONFIG_COMMUNITY_SLUG }

function communityFromConfig(): Community {
  return {
    slug: CONFIG_COMMUNITY_SLUG,
    name: configCommunity.name,
    shortName: configCommunity.shortName,
    tagline: configCommunity.tagline,
    mission: configCommunity.mission,
    manifestDescription: configCommunity.manifestDescription,
    region: configCommunity.region,
    timezone: configCommunity.timezone,
    mapCenter: configCommunity.mapCenter,
    themeColor: configCommunity.themeColor,
    backgroundColor: configCommunity.backgroundColor,
    features: {},
    ui: {},
    sortOrder: 0,
    isDefault: true,
    visible: true,
  }
}

/** Every community, in display order. Never empty — falls back to the config
 *  community when the table is missing or bare (fresh install, or the
 *  migration not yet run).
 *
 *  Cached: this is read on every request (the layout resolves the community
 *  from the path with it) and changes only when someone adds a community by
 *  hand. `communities` is the tag to invalidate if that ever moves into the
 *  admin. */
export async function listCommunities(): Promise<Community[]> {
  'use cache'
  cacheTag(TAGS.communities)
  cacheLife('days')

  try {
    const { data, error } = await getAdminClient()
      .from('community')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error || !data?.length) return [communityFromConfig()]
    return (data as Row[]).map(toCommunity)
  } catch {
    return [communityFromConfig()]
  }
}

/** The community served when the visitor hasn't picked one — the row flagged
 *  `is_default`, else the first by sort order. */
export async function getDefaultCommunity(): Promise<Community> {
  const all = await listCommunities()
  return all.find((c) => c.isDefault) ?? all[0]
}

/** Resolves a requested slug to a real community, falling back to the default
 *  rather than erroring: a stale slug in someone's localStorage (a community
 *  that was renamed or removed) should quietly land them somewhere real. */
export async function resolveCommunity(slug: string | null | undefined): Promise<Community> {
  const all = await listCommunities()
  if (slug) {
    const hit = all.find((c) => c.slug === slug)
    if (hit) return hit
  }
  return all.find((c) => c.isDefault) ?? all[0]
}

/** The admin email configured for one community, or null if it hasn't been
 *  set yet. Server-only, and deliberately NOT part of the `Community` type /
 *  `listCommunities()`'s output — that object is serialized straight to any
 *  visitor via the public GET /api/communities (the header switcher's data
 *  source), so an admin's email has no business riding along on it. Used
 *  only by adminAuth.ts's per-community authorization check. Not cached
 *  ('use cache'/cacheTag) like listCommunities() — this is read at admin
 *  sign-in/authorization time, where a stale value could wrongly admit or
 *  reject someone right after it was changed, and it's a single indexed-row
 *  point query, not a page-render-path cost worth caching. */
export async function getCommunityAdminEmail(slug: string): Promise<string | null> {
  const { data } = await getAdminClient().from('community').select('admin_email').eq('slug', slug).maybeSingle()
  return (data as { admin_email: string | null } | null)?.admin_email ?? null
}

/** Every community's configured admin_email, keyed by slug — same
 *  server-only, uncached reasoning as getCommunityAdminEmail above, just for
 *  all communities at once. Used by the superadmin communities list
 *  (GET /api/admin/communities) so /admin can show which login email governs
 *  each community, without ever putting emails on the public
 *  /api/communities payload that listCommunities()/Community feeds. */
export async function listCommunityAdminEmails(): Promise<Record<string, string | null>> {
  const { data } = await getAdminClient().from('community').select('slug, admin_email')
  const out: Record<string, string | null> = {}
  for (const row of (data ?? []) as { slug: string; admin_email: string | null }[]) {
    out[row.slug] = row.admin_email
  }
  return out
}

/** Every community's visibility + preview token, keyed by slug — the shape
 *  src/proxy.ts needs to decide whether a hidden community's request should
 *  be let through. Deliberately its own function rather than reusing
 *  listCommunities()/Community: the token must never ride on the public
 *  /api/communities payload (same reasoning as admin_email), and proxy.ts
 *  runs outside the request-cache lifecycle 'use cache' assumes, so this
 *  stays a plain uncached read like getCommunityAdminEmail. */
export async function listCommunityVisibility(): Promise<
  Record<string, { visible: boolean; previewToken: string }>
> {
  const { data } = await getAdminClient().from('community').select('slug, visible, preview_token')
  const out: Record<string, { visible: boolean; previewToken: string }> = {}
  for (const row of (data ?? []) as { slug: string; visible: boolean; preview_token: string }[]) {
    out[row.slug] = { visible: row.visible, previewToken: row.preview_token }
  }
  return out
}

/** Every community's preview token, keyed by slug — what CommunityManager
 *  needs to show a superadmin the shareable link for a hidden community.
 *  Same server-only/uncached reasoning as listCommunityAdminEmails. */
export async function listCommunityPreviewTokens(): Promise<Record<string, string>> {
  const { data } = await getAdminClient().from('community').select('slug, preview_token')
  const out: Record<string, string> = {}
  for (const row of (data ?? []) as { slug: string; preview_token: string }[]) {
    out[row.slug] = row.preview_token
  }
  return out
}

/** Reads the requested community slug off an incoming request. Query param
 *  only for now — the URL/subdomain shape is still undecided, and keeping the
 *  read in one place means changing it later touches this function alone. */
export function communitySlugFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get('community')
}

/** True if a valid IANA zone — `new Intl.DateTimeFormat` throws on anything
 *  else. Same check community.config.ts's own bootstrap validator uses. */
function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** Creates a new community — the "New Community" admin flow's write path.
 *
 *  Validates the slug the same way a category/form slug is validated
 *  (assertUsableSlug — shape + the reserved-word list, since a community
 *  slug is a first-path-segment exactly like `admin`/`inbox`/`api`), plus a
 *  live uniqueness check against existing communities, since assertUsableSlug
 *  only knows about the fixed reserved words, not what's already taken.
 *
 *  `sortOrder` is one past whatever the highest existing value is, so a new
 *  community always lands at the end of the switcher rather than needing an
 *  explicit position. `isDefault` is never settable here — the community
 *  served for a bare "/" stays a deliberate, single admin action elsewhere,
 *  not a side effect of creating a new one. */
export async function createCommunity(input: {
  slug: string
  name: string
  tagline: string
  mission: string
  region: string
  timezone: string
  mapCenter: { lat: number; lng: number }
  themeColor: string
  backgroundColor: string
  adminEmail?: string
}): Promise<Community> {
  const slug = input.slug.trim().toLowerCase()
  assertUsableSlug(slug)

  const existing = await listCommunities()
  if (existing.some((c) => c.slug === slug)) {
    throw new Error(`"${slug}" is already in use by another community.`)
  }

  if (!input.name.trim()) throw new Error('Community name is required.')
  if (!isValidPinColor(input.themeColor)) throw new Error('Brand color must be a hex value like #1d4ed8.')
  if (!isValidPinColor(input.backgroundColor)) throw new Error('Background color must be a hex value like #f8fafc.')
  if (!isValidTimezone(input.timezone)) throw new Error(`"${input.timezone}" is not a valid timezone.`)
  const { lat, lng } = input.mapCenter
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Map center latitude must be between -90 and 90.')
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Map center longitude must be between -180 and 180.')

  const sortOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 10

  const { data, error } = await getAdminClient()
    .from('community')
    .insert({
      slug,
      name: input.name.trim(),
      short_name: input.name.trim().slice(0, 20),
      tagline: input.tagline.trim(),
      mission: input.mission.trim(),
      manifest_description: input.mission.trim(),
      region: input.region.trim(),
      timezone: input.timezone,
      map_center: input.mapCenter,
      theme_color: input.themeColor,
      background_color: input.backgroundColor,
      admin_email: input.adminEmail?.trim() || null,
      sort_order: sortOrder,
      is_default: false,
      // Starts hidden from the switcher/sitemap — see the visibility
      // migration's own comment. Its own pages and admin console work
      // immediately by direct URL; a superadmin publishes it explicitly
      // once it's ready (setCommunityVisibility below).
      visible: false,
    })
    .select('*')
    .single()

  if (error) {
    // The uniqueness check above reads listCommunities(), which is cached
    // ('days') — two creations for the same slug landing inside that
    // staleness window both pass it and fall through to the database's own
    // primary-key constraint. Re-map that to the same friendly message
    // instead of surfacing Postgres's raw constraint-violation text, the
    // same way categoryStore.createCategory does for its own singleton
    // collision.
    if (error.code === '23505') {
      throw new Error(`"${slug}" is already in use by another community.`)
    }
    throw new Error(`Failed to create community: ${error.message}`)
  }
  return toCommunity(data as Row)
}

/** Flips whether a community shows up in the public switcher/sitemap
 *  (see the visibility migration's own comment). Superadmin-only action —
 *  gated by the same GET/POST /api/admin/communities check, not any one
 *  community's own admin, since publishing a community isn't scoped to
 *  itself any more than creating one is. */
export async function setCommunityVisibility(
  slug: string,
  visible: boolean,
): Promise<{ community: Community; previewToken: string }> {
  const update: { visible: boolean; preview_token?: string } = { visible }
  // Unpublishing also rotates the preview token, so a link (or the cookie
  // proxy.ts sets from one — see that file's own comment) handed out before
  // stops working the instant the community is hidden again, instead of
  // quietly continuing to work forever off whatever token it already has.
  // Publishing doesn't need this: the token isn't meaningful while visible.
  if (!visible) update.preview_token = crypto.randomUUID()

  const { data, error } = await getAdminClient().from('community').update(update).eq('slug', slug).select('*').single()
  if (error) throw new Error(`Failed to update "${slug}"'s visibility: ${error.message}`)
  const row = data as Row & { preview_token: string }
  return { community: toCommunity(row), previewToken: row.preview_token }
}

/** Every table that carries `community_id` — the tables `deleteCommunity`
 *  sweeps before removing the `community` row itself. `community_id` is a
 *  plain column with no foreign key back to `community` (see this module's
 *  migration file's own note on why: resource.category isn't FK'd either,
 *  for the same slug-collision reason), so nothing cascades on its own —
 *  deleting a community without this would leave every one of its listings,
 *  categories, forms, submissions, etc. orphaned in the database forever,
 *  invisible but never cleaned up. Kept in one place so a new
 *  community-scoped table added later doesn't get silently left behind by a
 *  delete. Rows within each table that reference `resource.id` (votes, the
 *  tag junction) are left to their own existing FK cascade — see
 *  resourceStore.ts's hardDeleteArchivedResource. */
const COMMUNITY_SCOPED_TABLES = [
  'resource',
  'category',
  'form',
  'home_section',
  'site_settings',
  'submission',
  'form_response',
  'hospital',
  'tag',
] as const

/** Permanently deletes a community and every row that belongs to it —
 *  every listing, category, form, submission, site setting, tag, hospital,
 *  and form response. Irreversible, and there is no confirmation step
 *  in here — that belongs to the caller (see
 *  /api/admin/communities/[slug]/route.ts, which requires the admin to
 *  retype the slug, and CommunityManager.tsx, which shows the warning).
 *
 *  Refuses on the default community — there must always be exactly one
 *  (community_single_default_idx), and there's no "make a different one
 *  default" flow yet to reassign it to — and when this is the only
 *  community left, since listCommunities() is documented as never empty. */
export async function deleteCommunity(slug: string): Promise<void> {
  const all = await listCommunities()
  const target = all.find((c) => c.slug === slug)
  if (!target) throw new Error(`"${slug}" is not a real community.`)
  if (target.isDefault) throw new Error('The default community cannot be deleted.')
  if (all.length <= 1) throw new Error('Cannot delete the only remaining community.')

  const supabase = getAdminClient()
  for (const table of COMMUNITY_SCOPED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('community_id', slug)
    if (error) throw new Error(`Failed to delete ${table} rows: ${error.message}`)
  }

  const { error } = await supabase.from('community').delete().eq('slug', slug)
  if (error) throw new Error(`Failed to delete community: ${error.message}`)
}
