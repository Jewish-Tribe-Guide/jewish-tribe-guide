import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { slugify } from './categoryStore'
import type { HomeSection } from './homeSections'

type HomeSectionRow = {
  id: string
  title: string
  sort_order: number
  card_ids: string[]
}

function toSection(row: HomeSectionRow): HomeSection {
  return {
    id: row.id,
    title: row.title,
    sortOrder: row.sort_order,
    cardIds: row.card_ids ?? [],
  }
}

// All sections, in display order.
export async function listHomeSections(community: string): Promise<HomeSection[]> {
  'use cache'
  cacheTag(TAGS.homeSections(community))
  cacheLife('days')
  const { data, error } = await getAdminClient()
    .from('home_section')
    .select('*')
    .eq('community_id', community)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load home sections: ${error.message}`)
  return (data as HomeSectionRow[]).map(toSection)
}

// Creates a section, picking a unique slug derived from its title. New
// sections start empty (no cards) and sort last.
export async function createHomeSection(input: {
  title: string
  cardIds?: string[]
}): Promise<HomeSection> {
  const supabase = getAdminClient()
  const base = slugify(input.title) || 'section'

  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase.from('home_section').select('id').eq('id', id).maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const { count } = await supabase.from('home_section').select('id', { count: 'exact', head: true })
  const sortOrder = ((count ?? 0) + 1) * 100

  const row = {
    id,
    title: input.title.trim(),
    sort_order: sortOrder,
    card_ids: input.cardIds ?? [],
  }

  const { data, error } = await supabase.from('home_section').insert(row).select('*').single()
  if (error) throw new Error(`Failed to create section: ${error.message}`)
  return toSection(data as HomeSectionRow)
}

// Updates a section's title, card membership/order, or sort position. Only the
// provided keys change. The slug (id) is immutable.
export async function updateHomeSection(
  id: string,
  patch: { title?: string; cardIds?: string[]; sortOrder?: number },
): Promise<HomeSection | null> {
  const supabase = getAdminClient()

  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.cardIds !== undefined) row.card_ids = patch.cardIds
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder

  if (Object.keys(row).length === 0) {
    const { data } = await supabase.from('home_section').select('*').eq('id', id).maybeSingle()
    return data ? toSection(data as HomeSectionRow) : null
  }

  const { data, error } = await supabase
    .from('home_section')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to update section: ${error.message}`)
  return data ? toSection(data as HomeSectionRow) : null
}

export async function deleteHomeSection(id: string): Promise<void> {
  const { error } = await getAdminClient().from('home_section').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete section: ${error.message}`)
}
