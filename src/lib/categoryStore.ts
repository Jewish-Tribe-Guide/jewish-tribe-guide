import { getAdminClient } from './supabase/admin'
import { getDefaultCommunity } from './communityStore'
import {
  DEFAULT_CATEGORY_ICON,
  resolveCapabilities,
  type CategoryCapabilities,
  type CategoryConfig,
  type CategoryField,
  type CategoryKind,
} from './categories'

type CategoryRow = {
  id: string
  label: string
  plural_label: string
  icon: string
  description: string
  fields: CategoryField[]
  kind: CategoryKind
  sort_order: number
  upvotes_enabled: boolean
  has_address: boolean
  has_phone: boolean
  capabilities: Partial<CategoryCapabilities> | null
  external_link_label: string | null
  external_link_url: string | null
  card_image_url: string | null
  card_text_color: string | null
}

function toConfig(row: CategoryRow): CategoryConfig {
  return {
    id: row.id,
    label: row.label,
    pluralLabel: row.plural_label,
    icon: row.icon,
    description: row.description,
    detailFields: row.fields ?? [],
    kind: row.kind,
    sortOrder: row.sort_order,
    hasAddress: row.has_address !== false,
    hasPhone: row.has_phone !== false,
    upvotesEnabled: !!row.upvotes_enabled,
    capabilities: resolveCapabilities(row.capabilities),
    externalLink:
      row.external_link_label && row.external_link_url
        ? { label: row.external_link_label, url: row.external_link_url }
        : null,
    cardImageUrl: row.card_image_url,
    cardTextColor: row.card_text_color,
  }
}

// All categories, ordered for the directory index.
export async function listCategories(community: string): Promise<CategoryConfig[]> {
  // Ordered alphabetically by the plural label shown on the cards. (The
  // `sort_order` column is still stored so a community can switch to manual
  // ordering later, but for now the directory is purely alphabetical.)
  const { data, error } = await getAdminClient()
    .from('category')
    .select('*')
    .eq('community_id', community)
    .order('plural_label', { ascending: true })

  if (error) throw new Error(`Failed to load categories: ${error.message}`)
  return (data as CategoryRow[]).map(toConfig)
}

export async function getCategoryById(community: string, id: string): Promise<CategoryConfig | null> {
  const { data, error } = await getAdminClient()
    .from('category')
    .select('*')
    .eq('community_id', community)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load category: ${error.message}`)
  return data ? toConfig(data as CategoryRow) : null
}

// Turns a human label into a URL-safe slug, e.g. "Car Repair" → "car-repair".
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Creates a category, picking a unique slug derived from its label. Returns the
// created config (with its final id). New categories start with no detail fields
// (the owner can add fields later); they render via the generic card renderer.
const KIND_LABELS: Record<CategoryKind, string> = {
  listing: 'category',
  map: 'Map category',
  zmanim: 'Zmanim category',
  eruv: 'Eruv Information category',
  medical: 'Jewish Medical Resources category',
}

export async function createCategory(input: {
  label: string
  pluralLabel?: string
  icon?: string
  description?: string
  fields?: CategoryField[]
  kind?: CategoryKind
  sortOrder?: number
  hasAddress?: boolean
  hasPhone?: boolean
  upvotesEnabled?: boolean
  capabilities?: Partial<CategoryCapabilities>
  externalLink?: { label: string; url: string } | null
  cardImageUrl?: string | null
  cardTextColor?: string | null
}): Promise<CategoryConfig> {
  const supabase = getAdminClient()
  const base = slugify(input.label) || 'category'
  const kind = input.kind ?? 'listing'

  // Ensure a unique id.
  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('category').select('id').eq('id', id).maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const row = {
    id,
    label: input.label.trim(),
    plural_label: (input.pluralLabel || input.label).trim(),
    icon: input.icon?.trim() || DEFAULT_CATEGORY_ICON,
    description: input.description?.trim() || '',
    fields: input.fields ?? [],
    kind,
    sort_order: input.sortOrder ?? 100,
    has_address: input.hasAddress ?? true,
    has_phone: input.hasPhone ?? true,
    upvotes_enabled: !!input.upvotesEnabled,
    capabilities: input.capabilities ?? {},
    external_link_label: input.externalLink?.label ?? null,
    external_link_url: input.externalLink?.url ?? null,
    card_image_url: input.cardImageUrl?.trim() || null,
    card_text_color: input.cardTextColor?.trim() || null,
  }

  const { data, error } = await supabase.from('category').insert(row).select('*').single()
  if (error) {
    // A Map/Zmanim row already exists (category_kind_singleton) — surface a
    // friendly message instead of the raw constraint-violation text.
    if (error.code === '23505' && kind !== 'listing') {
      throw new Error(`A ${KIND_LABELS[kind]} already exists.`)
    }
    throw new Error(`Failed to create category: ${error.message}`)
  }
  return toConfig(data as CategoryRow)
}

// Updates an existing category's presentation, fields, and capabilities. Only
// the provided keys are changed. The slug (`id`) is immutable — it's referenced
// by every listing's `resource.category`, so it's never rewritten here.
export async function updateCategory(
  id: string,
  patch: {
    label?: string
    pluralLabel?: string
    icon?: string
    description?: string
    fields?: CategoryField[]
    sortOrder?: number
    hasAddress?: boolean
    hasPhone?: boolean
    upvotesEnabled?: boolean
    capabilities?: Partial<CategoryCapabilities>
    externalLink?: { label: string; url: string } | null
    cardImageUrl?: string | null
    cardTextColor?: string | null
  },
): Promise<CategoryConfig | null> {
  const supabase = getAdminClient()

  const row: Record<string, unknown> = {}
  if (patch.label !== undefined) row.label = patch.label.trim()
  if (patch.pluralLabel !== undefined) row.plural_label = patch.pluralLabel.trim()
  if (patch.icon !== undefined) row.icon = patch.icon.trim() || DEFAULT_CATEGORY_ICON
  if (patch.description !== undefined) row.description = patch.description.trim()
  if (patch.fields !== undefined) row.fields = patch.fields
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder
  if (patch.hasAddress !== undefined) row.has_address = !!patch.hasAddress
  if (patch.hasPhone !== undefined) row.has_phone = !!patch.hasPhone
  if (patch.upvotesEnabled !== undefined) row.upvotes_enabled = !!patch.upvotesEnabled
  if (patch.capabilities !== undefined) row.capabilities = patch.capabilities
  if (patch.externalLink !== undefined) {
    row.external_link_label = patch.externalLink?.label ?? null
    row.external_link_url = patch.externalLink?.url ?? null
  }
  if (patch.cardImageUrl !== undefined) row.card_image_url = patch.cardImageUrl?.trim() || null
  if (patch.cardTextColor !== undefined) row.card_text_color = patch.cardTextColor?.trim() || null

  // Admin edits are still single-community — see the note in communityStore.
  // Scoping the write by community as well as id means a future second
  // community's identically-slugged category can't be hit by mistake.
  const community = (await getDefaultCommunity()).slug
  if (Object.keys(row).length === 0) return getCategoryById(community, id)

  const { data, error } = await supabase
    .from('category')
    .update(row)
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to update category: ${error.message}`)
  return data ? toConfig(data as CategoryRow) : null
}

// Permanently deletes a category and every listing in it. Listings are removed
// first (resource.category has no DB cascade), then the category row. Votes
// cascade from the resource delete. Returns how many listings were removed so
// the caller can confirm the scope of the deletion.
export async function deleteCategory(id: string): Promise<{ listings: number }> {
  const supabase = getAdminClient()

  const { count } = await supabase
    .from('resource')
    .select('id', { count: 'exact', head: true })
    .eq('category', id)

  const { error: resErr } = await supabase.from('resource').delete().eq('category', id)
  if (resErr) throw new Error(`Failed to delete the category's listings: ${resErr.message}`)

  const { error: catErr } = await supabase.from('category').delete().eq('id', id)
  if (catErr) throw new Error(`Failed to delete category: ${catErr.message}`)

  return { listings: count ?? 0 }
}
