import { getAdminClient } from './supabase/admin'

export type Tag = { slug: string; label: string; group: string }

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// The tag vocabulary for a group (e.g. 'kosher_product'), alphabetical.
export async function listTags(community: string, group: string): Promise<Tag[]> {
  const { data, error } = await getAdminClient()
    .from('tag')
    .select('slug,label,group')
    .eq('community_id', community)
    .eq('group', group)
    .order('label', { ascending: true })

  if (error) throw new Error(`Failed to load tags: ${error.message}`)
  return data as Tag[]
}

// Adds any new labels to the vocabulary for a group (so future submitters can
// pick them). Idempotent via slug. Called when a listing with tags is approved.
export async function upsertTags(community: string, labels: string[], group: string): Promise<void> {
  const rows = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].map((label) => ({
    community_id: community,
    slug: slugify(label),
    label,
    group,
  }))
  if (rows.length === 0) return

  // Matches the composite unique the communities migration put on tag: the
  // same slug is a separate row per community.
  const { error } = await getAdminClient().from('tag').upsert(rows, { onConflict: 'community_id,slug' })
  if (error) throw new Error(`Failed to upsert tags: ${error.message}`)
}
