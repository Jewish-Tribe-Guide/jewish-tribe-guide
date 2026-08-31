import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { resolveCommunity } from './communityStore'
import {
  DEFAULT_MOBILE_TABS,
  MAX_MOBILE_TABS,
  SITE_SETTINGS_DEFAULTS,
  type MobileTabConfig,
  type SiteSettings,
} from './siteSettings'

const ROW_ID = 'default'

type Row = {
  id: string
  name: string
  tagline: string
  hero_title: string
  mission: string
  logo_url: string | null
  feedback_enabled: boolean
  feedback_button_label: string
  feedback_heading: string
  feedback_success_message: string
  featured_card_ids: string[] | null
  mobile_tabs: unknown
}

// jsonb comes back as whatever was written, and this column predates nothing —
// it can legitimately be null (migration not yet run, or never configured).
// Anything that isn't a usable array of tabs falls back to the built-in trio
// rather than rendering an empty or half-broken bar on every phone.
function toMobileTabs(raw: unknown): MobileTabConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_MOBILE_TABS
  const tabs = raw.flatMap((entry): MobileTabConfig[] => {
    if (!entry || typeof entry !== 'object') return []
    const { id, label, target } = entry as Record<string, unknown>
    if (typeof id !== 'string' || typeof label !== 'string' || typeof target !== 'string') return []
    if (!id.trim() || !label.trim() || !target.trim()) return []
    return [{ id, label, target }]
  })
  return tabs.length ? tabs.slice(0, MAX_MOBILE_TABS) : DEFAULT_MOBILE_TABS
}

function toSettings(row: Row | null, fallback: SiteSettings = SITE_SETTINGS_DEFAULTS): SiteSettings {
  if (!row) return fallback
  return {
    name: row.name,
    tagline: row.tagline,
    heroTitle: row.hero_title,
    mission: row.mission,
    logoUrl: row.logo_url,
    feedbackEnabled: row.feedback_enabled,
    feedbackButtonLabel: row.feedback_button_label,
    feedbackHeading: row.feedback_heading,
    feedbackSuccessMessage: row.feedback_success_message,
    // Null until the column's migration has been run (or before the first
    // save) — normalized to [] so callers never have to null-check it.
    featuredCardIds: row.featured_card_ids ?? [],
    mobileTabs: toMobileTabs(row.mobile_tabs),
  }
}

// The single settings row, or that community's own defaults if none exists
// yet (a fresh deployment, before the first admin edit). Uncached — reads
// Supabase directly. Used by the admin route (read-after-write consistency,
// same reasoning as categoryStore's listCategoriesUncached) and by
// updateSiteSettings' own merge-before-save below, which would otherwise risk
// merging a patch onto a stale cached snapshot if two saves land close
// together (revalidateTag('max') marks the cache stale but doesn't purge it,
// so a read right after a save can still return the pre-save row).
//
// The fallback used to be a single module-level SITE_SETTINGS_DEFAULTS built
// from community.config.ts (the bootstrap community) — fine while only one
// community existed, but a second community with no site_settings row yet
// would render Philadelphia's name/tagline/mission on its own domain until an
// admin saved something. Falls back to the resolved `community` row's own
// branding instead, so an un-configured community reads as itself, empty,
// rather than as someone else's site.
export async function getSiteSettingsUncached(community: string): Promise<SiteSettings> {
  const { data, error } = await getAdminClient()
    .from('site_settings')
    .select('*')
    .eq('community_id', community)
    .maybeSingle()

  if (error) throw new Error(`Failed to load site settings: ${error.message}`)
  if (data) return toSettings(data as Row)

  const c = await resolveCommunity(community)
  return { ...SITE_SETTINGS_DEFAULTS, name: c.name, tagline: c.tagline, mission: c.mission }
}

// Same as getSiteSettingsUncached, but cached for the public site.
export async function getSiteSettings(community: string): Promise<SiteSettings> {
  'use cache'
  cacheTag(TAGS.siteSettings(community))
  cacheLife('days')
  return getSiteSettingsUncached(community)
}

// Merges the given fields into the current settings and upserts the single
// row (creating it on first save). Only the provided keys change.
export async function updateSiteSettings(
  community: string,
  patch: Partial<SiteSettings>,
): Promise<SiteSettings> {
  const current = await getSiteSettingsUncached(community)
  const merged: SiteSettings = { ...current, ...patch }

  const { data, error } = await getAdminClient()
    .from('site_settings')
    .upsert(
      {
        id: ROW_ID,
        community_id: community,
        name: merged.name,
        tagline: merged.tagline,
        hero_title: merged.heroTitle,
        mission: merged.mission,
        logo_url: merged.logoUrl,
        feedback_enabled: merged.feedbackEnabled,
        feedback_button_label: merged.feedbackButtonLabel,
        feedback_heading: merged.feedbackHeading,
        feedback_success_message: merged.feedbackSuccessMessage,
        featured_card_ids: merged.featuredCardIds,
        mobile_tabs: merged.mobileTabs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'community_id' },
    )
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update site settings: ${error.message}`)
  return toSettings(data as Row)
}
