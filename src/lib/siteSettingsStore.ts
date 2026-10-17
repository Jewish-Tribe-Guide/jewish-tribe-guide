import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { resolveCommunity } from './communityStore'
import {
  DEFAULT_DESKTOP_NAV_ITEMS,
  DEFAULT_MOBILE_TABS,
  MAX_MOBILE_TABS,
  SITE_SETTINGS_DEFAULTS,
  DEFAULT_BEFORE_CANDLE_ITEMS,
  MAX_BEFORE_CANDLE_ITEMS,
  defaultHeroSplit,
  isHomeStyle,
  isTodayBlockId,
  type DesktopNavItem,
  type TodayBlockId,
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
  mobile_tabs: unknown
  search_placeholder: string | null
  desktop_nav_items: unknown
  desktop_browse_eyebrow: string | null
  desktop_browse_heading: string | null
  desktop_davening_eyebrow: string | null
  desktop_davening_heading: string | null
  desktop_listings_eyebrow: string | null
  desktop_listings_heading: string | null
  desktop_map_eyebrow: string | null
  desktop_map_heading: string | null
  desktop_subscribe_eyebrow: string | null
  desktop_subscribe_heading: string | null
  desktop_jewish_times_heading: string | null
  desktop_hero_headline: string | null
  desktop_hero_subhead: string | null
  desktop_hero_image: unknown
  /** Nothing reads this: the admin's accent colour was never applied to the
   *  site, and the redesign's one look retired it. The column stays rather
   *  than dropping data with a migration. */
  desktop_accent_color: string | null
  /** Migration 067. Absent on a row read before it's applied. */
  home_style?: string | null
  before_candle_items?: unknown
  today_hidden?: unknown
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

// Same shape as toMobileTabs above: jsonb comes back as whatever was
// written (or null pre-migration/pre-first-save), so anything that isn't a
// usable nav item list falls back to the fixed Categories/Map/More
// structure rather than rendering an empty header nav.
function toDesktopNavItem(entry: unknown): DesktopNavItem | null {
  if (!entry || typeof entry !== 'object') return null
  const { id, label, kind, target, items } = entry as Record<string, unknown>
  if (typeof id !== 'string' || !id.trim() || typeof label !== 'string' || !label.trim()) return null
  if (kind !== 'categories-menu' && kind !== 'more-menu' && kind !== 'link') return null
  if (kind === 'link' && (typeof target !== 'string' || !target.trim())) return null
  if (kind === 'more-menu') {
    const subItems = Array.isArray(items) ? items.flatMap((i) => toDesktopNavItem(i) ?? []) : []
    return { id, label, kind, items: subItems }
  }
  return kind === 'link' ? { id, label, kind, target: target as string } : { id, label, kind }
}

function toDesktopNavItems(raw: unknown): DesktopNavItem[] {
  if (!Array.isArray(raw)) return DEFAULT_DESKTOP_NAV_ITEMS
  const items = raw.flatMap((entry) => toDesktopNavItem(entry) ?? [])
  return items.length ? items : DEFAULT_DESKTOP_NAV_ITEMS
}

function toHeroImage(raw: unknown): { url: string; alt: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const { url, alt } = raw as Record<string, unknown>
  if (typeof url !== 'string' || !url.trim()) return null
  return { url, alt: typeof alt === 'string' ? alt : '' }
}

/** The admin's item names: trimmed, no blanks or repeats, at most
 *  MAX_BEFORE_CANDLE_ITEMS. Null (never set, or 067 not applied) is the
 *  starting list; an empty list is the admin's own "none". */
/** The Today blocks turned off: known ids only, each once. Anything else
 *  (null before migration 067, a hand-edited row) means none are. */
export function toTodayHidden(raw: unknown): TodayBlockId[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter(isTodayBlockId))]
}

export function toBeforeCandleItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_BEFORE_CANDLE_ITEMS
  const seen = new Set<string>()
  const items: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const name = entry.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    items.push(name)
  }
  return items.slice(0, MAX_BEFORE_CANDLE_ITEMS)
}

function toSettings(row: Row | null, fallback: SiteSettings = SITE_SETTINGS_DEFAULTS): SiteSettings {
  if (!row) return fallback
  const mission = row.mission
  const heroSplit = defaultHeroSplit(mission)
  return {
    name: row.name,
    tagline: row.tagline,
    heroTitle: row.hero_title,
    mission,
    logoUrl: row.logo_url,
    feedbackEnabled: row.feedback_enabled,
    feedbackButtonLabel: row.feedback_button_label,
    feedbackHeading: row.feedback_heading,
    feedbackSuccessMessage: row.feedback_success_message,
    mobileTabs: toMobileTabs(row.mobile_tabs),
    searchPlaceholder: row.search_placeholder || fallback.searchPlaceholder,
    desktopNavItems: toDesktopNavItems(row.desktop_nav_items),
    desktopBrowseEyebrow: row.desktop_browse_eyebrow || fallback.desktopBrowseEyebrow,
    desktopBrowseHeading: row.desktop_browse_heading || row.hero_title,
    desktopDaveningEyebrow: row.desktop_davening_eyebrow || fallback.desktopDaveningEyebrow,
    desktopDaveningHeading: row.desktop_davening_heading || fallback.desktopDaveningHeading,
    desktopListingsEyebrow: row.desktop_listings_eyebrow || fallback.desktopListingsEyebrow,
    desktopListingsHeading: row.desktop_listings_heading || fallback.desktopListingsHeading,
    desktopMapEyebrow: row.desktop_map_eyebrow || fallback.desktopMapEyebrow,
    desktopMapHeading: row.desktop_map_heading || fallback.desktopMapHeading,
    desktopSubscribeEyebrow: row.desktop_subscribe_eyebrow || fallback.desktopSubscribeEyebrow,
    desktopSubscribeHeading: row.desktop_subscribe_heading || fallback.desktopSubscribeHeading,
    desktopJewishTimesHeading: row.desktop_jewish_times_heading || fallback.desktopJewishTimesHeading,
    // Pre-migration/pre-first-save rows have no desktop hero fields of their
    // own yet — fall back to splitting this row's real mission, same as the
    // defaults object does at seed time, so an existing community's hero
    // doesn't blank out until someone opens the new Desktop tab.
    desktopHeroHeadline: row.desktop_hero_headline || heroSplit.headline,
    desktopHeroSubhead: row.desktop_hero_subhead ?? heroSplit.subhead,
    desktopHeroImage: toHeroImage(row.desktop_hero_image) ?? fallback.desktopHeroImage,
    homeStyle: isHomeStyle(row.home_style) ? row.home_style : 'classic',
    beforeCandleItems: toBeforeCandleItems(row.before_candle_items),
    todayHidden: toTodayHidden(row.today_hidden),
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
  const heroSplit = defaultHeroSplit(c.mission)
  return {
    ...SITE_SETTINGS_DEFAULTS,
    name: c.name,
    tagline: c.tagline,
    mission: c.mission,
    desktopHeroHeadline: heroSplit.headline,
    desktopHeroSubhead: heroSplit.subhead,
  }
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
  // The Today home's columns (migration 067) are written only when they
  // change, so the rest of the settings still save on a database that
  // doesn't have them yet. Changing one there says what's missing.
  const today: Record<string, unknown> = {}
  if (merged.homeStyle !== current.homeStyle) today.home_style = merged.homeStyle
  if (JSON.stringify(merged.beforeCandleItems) !== JSON.stringify(current.beforeCandleItems)) {
    today.before_candle_items = merged.beforeCandleItems
  }
  if (JSON.stringify(merged.todayHidden) !== JSON.stringify(current.todayHidden)) today.today_hidden = merged.todayHidden

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
        mobile_tabs: merged.mobileTabs,
        search_placeholder: merged.searchPlaceholder,
        desktop_nav_items: merged.desktopNavItems,
        desktop_browse_eyebrow: merged.desktopBrowseEyebrow,
        desktop_browse_heading: merged.desktopBrowseHeading,
        desktop_davening_eyebrow: merged.desktopDaveningEyebrow,
        desktop_davening_heading: merged.desktopDaveningHeading,
        desktop_listings_eyebrow: merged.desktopListingsEyebrow,
        desktop_listings_heading: merged.desktopListingsHeading,
        desktop_map_eyebrow: merged.desktopMapEyebrow,
        desktop_map_heading: merged.desktopMapHeading,
        desktop_subscribe_eyebrow: merged.desktopSubscribeEyebrow,
        desktop_subscribe_heading: merged.desktopSubscribeHeading,
        desktop_jewish_times_heading: merged.desktopJewishTimesHeading,
        desktop_hero_headline: merged.desktopHeroHeadline,
        desktop_hero_subhead: merged.desktopHeroSubhead,
        desktop_hero_image: merged.desktopHeroImage,
        ...today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'community_id' },
    )
    .select('*')
    .single()

  if (error) {
    if (Object.keys(today).length > 0 && /home_style|before_candle_items|today_hidden/.test(error.message)) {
      throw new MissingTodayColumnsError()
    }
    throw new Error(`Failed to update site settings: ${error.message}`)
  }
  return toSettings(data as Row)
}

/** The Today home's settings were changed on a database without migration
 *  067 (supabase/migrations/20240101000067_today_home.sql). */
export class MissingTodayColumnsError extends Error {
  constructor() {
    super('The home page style needs the database update in migration 067 (today_home) first.')
  }
}
