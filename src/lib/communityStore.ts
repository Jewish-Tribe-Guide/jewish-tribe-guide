import { cacheLife, cacheTag } from 'next/cache'
import { CONFIG_COMMUNITY_SLUG } from './configCommunity'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { community as configCommunity } from '@/community.config'

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
