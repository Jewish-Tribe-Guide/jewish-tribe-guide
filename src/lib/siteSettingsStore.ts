import { getAdminClient } from './supabase/admin'
import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from './siteSettings'

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
  }
}

// The single settings row, or the community.config defaults if none exists
// yet (a fresh deployment, before the first admin edit).
export async function getSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await getAdminClient()
    .from('site_settings')
    .select('*')
    .eq('id', ROW_ID)
    .maybeSingle()

  if (error) throw new Error(`Failed to load site settings: ${error.message}`)
  return toSettings(data as Row | null)
}

// Merges the given fields into the current settings and upserts the single
// row (creating it on first save). Only the provided keys change.
export async function updateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  const current = await getSiteSettings()
  const merged: SiteSettings = { ...current, ...patch }

  const { data, error } = await getAdminClient()
    .from('site_settings')
    .upsert(
      {
        id: ROW_ID,
        name: merged.name,
        tagline: merged.tagline,
        hero_title: merged.heroTitle,
        mission: merged.mission,
        logo_url: merged.logoUrl,
        feedback_enabled: merged.feedbackEnabled,
        feedback_button_label: merged.feedbackButtonLabel,
        feedback_heading: merged.feedbackHeading,
        feedback_success_message: merged.feedbackSuccessMessage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()

  if (error) throw new Error(`Failed to update site settings: ${error.message}`)
  return toSettings(data as Row)
}
