import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import { slugify } from './categoryStore'
import { BUILT_IN_BLOCKS, type HomeBlockKind, type HomeSection } from './homeSections'

type HomeSectionRow = {
  id: string
  kind: string
  title: string
  sort_order: number
  card_ids: string[]
}

// row.kind ?? 'section': the same "read before this migration ran" fallback
// every other widened site_settings/home_section column in this codebase
// uses — a row selected via `select('*')` before the column existed simply
// won't have the key at all.
function toSection(row: HomeSectionRow): HomeSection {
  const kind = (row.kind ?? 'section') as HomeBlockKind
  return {
    id: row.id,
    kind,
    // A built-in's title IS real admin-set data (the admin can rename
    // "Popular right now" etc. — see DesktopTopicsManager) — only falls back
    // to the BUILT_IN_BLOCKS default label when the row genuinely has none
    // yet (blank, or read before the row existed at all).
    title: row.title || (kind === 'section' ? '' : BUILT_IN_BLOCKS[kind].title),
    sortOrder: row.sort_order,
    cardIds: row.card_ids ?? [],
  }
}

// All sections, in display order. Uncached — reads Supabase directly. Used by
// the admin route, which needs read-after-write consistency (revalidateTag
// only marks the public cache stale, it doesn't purge it, so a cached read
// right after a save can still serve the pre-save list — see
// categoryStore.ts's listCategoriesUncached for the same pattern).
export async function listHomeSectionsUncached(community: string): Promise<HomeSection[]> {
  const { data, error } = await getAdminClient()
    .from('home_section')
    .select('*')
    .eq('community_id', community)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load home sections: ${error.message}`)
  return (data as HomeSectionRow[]).map(toSection)
}

// Same as listHomeSectionsUncached, but cached for the public site.
export async function listHomeSections(community: string): Promise<HomeSection[]> {
  'use cache'
  cacheTag(TAGS.homeSections(community))
  cacheLife('days')
  return listHomeSectionsUncached(community)
}

// Creates a section, picking a unique slug derived from its title. New
// sections start empty (no cards) and sort last.
//
// A built-in block (kind !== 'section') is different: its id/title are fixed
// (BUILT_IN_BLOCKS), title/cardIds passed in are ignored, and this upserts
// rather than plain-inserts — "+ Add block" in the admin editor re-adding a
// previously-removed built-in has to succeed even though a row for that
// exact id may already exist from an earlier session (or the one-time
// seed-home-blocks.mjs backfill), not conflict-error.
export async function createHomeSection(
  community: string,
  input: {
    title: string
    cardIds?: string[]
    kind?: HomeBlockKind
  },
): Promise<HomeSection> {
  const supabase = getAdminClient()
  const kind = input.kind ?? 'section'

  if (kind !== 'section') {
    const { count } = await supabase
      .from('home_section')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', community)
    const row = {
      id: BUILT_IN_BLOCKS[kind].id,
      community_id: community,
      kind,
      title: BUILT_IN_BLOCKS[kind].title,
      sort_order: ((count ?? 0) + 1) * 100,
      card_ids: [],
    }
    const { data, error } = await supabase
      .from('home_section')
      .upsert(row, { onConflict: 'community_id,id' })
      .select('*')
      .single()
    if (error) throw new Error(`Failed to add ${BUILT_IN_BLOCKS[kind].title}: ${error.message}`)
    return toSection(data as HomeSectionRow)
  }

  const base = slugify(input.title) || 'section'

  // Scoped by community — see createCategory's identical comment.
  let id = base
  for (let n = 2; ; n++) {
    const { data } = await supabase
      .from('home_section')
      .select('id')
      .eq('community_id', community)
      .eq('id', id)
      .maybeSingle()
    if (!data) break
    id = `${base}-${n}`
  }

  const { count } = await supabase
    .from('home_section')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community)
  const sortOrder = ((count ?? 0) + 1) * 100

  const row = {
    id,
    community_id: community,
    kind: 'section',
    title: input.title.trim(),
    sort_order: sortOrder,
    card_ids: input.cardIds ?? [],
  }

  const { data, error } = await supabase.from('home_section').insert(row).select('*').single()
  if (error) throw new Error(`Failed to create section: ${error.message}`)
  return toSection(data as HomeSectionRow)
}

// Updates a section's title, card membership/order, or sort position. Only the
// provided keys change. The slug (id) is immutable. A built-in block's title
// is real, admin-renameable data too (see DesktopTopicsManager) — only
// cardIds is meaningless for one (the admin editor never offers a "+ Add a
// card" picker for zmanim/map, since they aren't card groups).
export async function updateHomeSection(
  community: string,
  id: string,
  patch: { title?: string; cardIds?: string[]; sortOrder?: number },
): Promise<HomeSection | null> {
  const supabase = getAdminClient()

  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.cardIds !== undefined) row.card_ids = patch.cardIds
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder

  if (Object.keys(row).length === 0) {
    const { data } = await supabase
      .from('home_section')
      .select('*')
      .eq('community_id', community)
      .eq('id', id)
      .maybeSingle()
    return data ? toSection(data as HomeSectionRow) : null
  }

  const { data, error } = await supabase
    .from('home_section')
    .update(row)
    .eq('community_id', community)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to update section: ${error.message}`)
  return data ? toSection(data as HomeSectionRow) : null
}

export async function deleteHomeSection(community: string, id: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('home_section')
    .delete()
    .eq('community_id', community)
    .eq('id', id)
  if (error) throw new Error(`Failed to delete section: ${error.message}`)
}
