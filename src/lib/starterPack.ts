import { getAdminClient } from './supabase/admin'
import { STARTER_KINDS, STARTER_LISTING_IDS } from './starterPackContents'

// ─────────────────────────────────────────────────────────────────────────────
// The starter pack (Nov 25, board 2f): what a new community gets when the
// site owner leaves New community's Starter pack switch on. A few pages, the
// home and tabs, no places, copied from the default community (Philly) and
// cleared of what is that community's own.
//
// The pages are a chosen list, not "whatever the default has": the user
// (Nov 25) "what Philly has is too much for a starter pack", and empty
// pages read as a site under construction. Candle Lighting, the Map and the
// Eruv come by kind; the listing pages by id.
//
// Cleared on the way: photos (they're of that city's places), the walk list
// and the outside link (mikvah.org's directory, at Philly's coordinates),
// and the hechshers the Food page offers (the user: "hechshers should be
// empty"; every city's certifiers are its own). Never copied: places,
// forms, the logo and the home's photos.
//
// The food words (tags) are copied, slugs and labels only, so item search
// knows "challah" on day one. This changes the old clone's rule (never copy
// crowdsourced vocabulary): the words are general, and which places carry
// them stays behind, since resource_tag isn't touched.
// ─────────────────────────────────────────────────────────────────────────────

export { STARTER_LISTING_IDS, STARTER_KINDS } from './starterPackContents'

/** The field whose choices are a city's certifiers. */
const HECHSHER_FIELD = 'kosherCert'

/** Home rows no screen draws any more (Landing.tsx), never copied. */
export const RETIRED_HOME_KINDS = ['zmanim', 'shabbat', 'featured', 'listings'] as const

/** What the new home and tabs keep from the default's settings. Not the
 *  logo, the hero photo or the map card's photo (that city's), nor the
 *  name and mission (the new community's own). */
const SETTINGS_COPIED = [
  'hero_title',
  'feedback_enabled',
  'feedback_button_label',
  'feedback_heading',
  'feedback_success_message',
  'mobile_tabs',
  'search_placeholder',
  'desktop_nav_items',
  'desktop_hero_headline',
  'desktop_hero_subhead',
  'desktop_accent_color',
  'desktop_listings_eyebrow',
  'desktop_listings_heading',
  'desktop_subscribe_eyebrow',
  'desktop_subscribe_heading',
  'right_now_categories',
] as const

type Row = Record<string, unknown>

export type StarterSource = {
  /** The default community's region ("Philadelphia"), swapped for the new
   *  one's wherever the copied words say it. */
  region: string
  categories: Row[]
  sections: Row[]
  settings: Row | null
  tags: Row[]
}

export type StarterRows = {
  categories: Row[]
  sections: Row[]
  settings: Row | null
  tags: Row[]
}

function withoutTimestamps(row: Row): Row {
  const rest = { ...row }
  delete rest.created_at
  delete rest.updated_at
  return rest
}

function inPack(row: Row): boolean {
  if (row.active === false) return false
  if ((STARTER_KINDS as readonly unknown[]).includes(row.kind)) return true
  return row.kind === 'listing' && (STARTER_LISTING_IDS as readonly unknown[]).includes(row.id)
}

function cleared(fields: unknown): unknown {
  if (!Array.isArray(fields)) return fields
  return fields.map((f) => (f && typeof f === 'object' && (f as Row).key === HECHSHER_FIELD ? { ...(f as Row), options: [] } : f))
}

/** The default's city name swapped for the new one's, as a whole word, in
 *  a copied sentence: "Your Guide to Jewish Philadelphia". */
function inCity(text: unknown, from: string, to: string): unknown {
  if (typeof text !== 'string' || !from.trim()) return text
  const escaped = from.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`\\b${escaped}\\b`, 'g'), to)
}

/** The rows a new community starts with, from what the default has. Pure:
 *  copyStarterPack reads and writes around it. */
export type StarterTarget = { slug: string; name: string; region: string; mission: string }

export function starterRows(source: StarterSource, target: StarterTarget): StarterRows {
  const categories = source.categories.filter(inPack).map((row): Row => ({
    ...withoutTimestamps(row),
    community_id: target.slug,
    fields: cleared(row.fields),
    card_image_url: null,
    card_band_image_url: null,
    icon_image_url: null,
    walk_list: null,
    external_link_url: null,
    external_link_label: null,
  }))
  const ids = new Set(categories.map((c) => c.id))

  const sections = source.sections.flatMap((row) => {
    if ((RETIRED_HOME_KINDS as readonly unknown[]).includes(row.kind)) return []
    const copy = { ...withoutTimestamps(row), community_id: target.slug }
    if (row.kind !== 'section') return [copy]
    // A group of tiles keeps the pack's pages, and goes when none are left
    // (Family Resources, Medical Resources, In the Know).
    const cardIds = Array.isArray(row.card_ids) ? row.card_ids.filter((id) => ids.has(id)) : []
    return cardIds.length ? [{ ...copy, card_ids: cardIds }] : []
  })

  let settings: Row | null = null
  if (source.settings) {
    settings = { id: source.settings.id ?? 'default', community_id: target.slug, name: target.name, mission: target.mission }
    for (const key of SETTINGS_COPIED) {
      if (!(key in source.settings)) continue
      settings[key] = inCity(source.settings[key], source.region, target.region)
    }
    if (Array.isArray(source.settings.right_now_categories)) {
      settings.right_now_categories = source.settings.right_now_categories.filter((id) => ids.has(id))
    }
  }

  const tags = source.tags.map((t) => ({ slug: t.slug, label: t.label, group: t.group, community_id: target.slug }))

  return { categories, sections, settings, tags }
}

/** Reads the default community's pages, home, settings and food words, and
 *  writes the pack's share of them into `target`. */
export async function copyStarterPack(target: StarterTarget): Promise<void> {
  const supabase = getAdminClient()
  const { data: from, error: fromErr } = await supabase.from('community').select('slug, region').eq('is_default', true).maybeSingle()
  if (fromErr) throw new Error(`Failed to find the default community: ${fromErr.message}`)
  if (!from) throw new Error('There is no default community to copy the starter pack from.')
  const slug = (from as Row).slug as string

  const read = async (table: string) => {
    const { data, error } = await supabase.from(table).select('*').eq('community_id', slug)
    if (error) throw new Error(`Failed to read ${table} for the starter pack: ${error.message}`)
    return (data ?? []) as Row[]
  }
  const [categories, sections, settingsRows, tags] = await Promise.all([read('category'), read('home_section'), read('site_settings'), read('tag')])

  const rows = starterRows({ region: (from as Row).region as string, categories, sections, settings: settingsRows[0] ?? null, tags }, target)

  const write = async (table: string, value: Row[] | Row) => {
    if (Array.isArray(value) && !value.length) return
    const { error } = await supabase.from(table).insert(value)
    if (error) throw new Error(`Failed to copy ${table} into the starter pack: ${error.message}`)
  }
  await write('category', rows.categories)
  await write('home_section', rows.sections)
  if (rows.settings) await write('site_settings', rows.settings)
  await write('tag', rows.tags)
}
