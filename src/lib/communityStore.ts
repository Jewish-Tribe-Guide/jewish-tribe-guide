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
