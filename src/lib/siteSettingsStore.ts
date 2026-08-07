import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
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

function toSettings(row: Row | null): SiteSettings {
  if (!row) return SITE_SETTINGS_DEFAULTS
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

// The single settings row, or the community.config defaults if none exists
// yet (a fresh deployment, before the first admin edit).
export async function getSiteSettings(community: string): Promise<SiteSettings> {
  'use cache'
  cacheTag(TAGS.siteSettings(community))
  cacheLife('days')
  const { data, error } = await getAdminClient()
    .from('site_settings')
    .select('*')
    .eq('community_id', community)
    .maybeSingle()

  if (error) throw new Error(`Failed to load site settings: ${error.message}`)
  return toSettings(data as Row | null)
}

// Merges the given fields into the current settings and upserts the single
// row (creating it on first save). Only the provided keys change.
export async function updateSiteSettings(
  community: string,
  patch: Partial<SiteSettings>,
): Promise<SiteSettings> {
  const current = await getSiteSettings(community)
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
