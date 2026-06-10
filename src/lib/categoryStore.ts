import { getAdminClient } from './supabase/admin'
import {
  DEFAULT_CATEGORY_ICON,
  COMMUNITY_CATEGORY_IDS,
  type CategoryConfig,
  type CategoryField,
} from './categories'

type CategoryRow = {
  id: string
  label: string
  plural_label: string
  icon: string
  description: string
  fields: CategoryField[]
  sort_order: number
  upvotes_enabled: boolean
}

function toConfig(row: CategoryRow): CategoryConfig {
  return {
    id: row.id,
    label: row.label,
    pluralLabel: row.plural_label,
    icon: row.icon,
    description: row.description,
    detailFields: row.fields ?? [],
    sortOrder: row.sort_order,
    community: COMMUNITY_CATEGORY_IDS.has(row.id),
    upvotesEnabled: !!row.upvotes_enabled,
  }
}

// All categories, ordered for the directory index.
export async function listCategories(): Promise<CategoryConfig[]> {
  const { data, error } = await getAdminClient()
    .from('category')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) throw new Error(`Failed to load categories: ${error.message}`)
  return (data as CategoryRow[]).map(toConfig)
}

export async function getCategoryById(id: string): Promise<CategoryConfig | null> {
  const { data, error } = await getAdminClient()
    .from('category')
    .select('*')
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
export async function createCategory(input: {
  label: string
  pluralLabel?: string
  icon?: string
  description?: string
  fields?: CategoryField[]
  upvotesEnabled?: boolean
}): Promise<CategoryConfig> {
  const supabase = getAdminClient()
  const base = slugify(input.label) || 'category'

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
    sort_order: 100,
    upvotes_enabled: !!input.upvotesEnabled,
  }

  const { data, error } = await supabase.from('category').insert(row).select('*').single()
  if (error) throw new Error(`Failed to create category: ${error.message}`)
  return toConfig(data as CategoryRow)
}
