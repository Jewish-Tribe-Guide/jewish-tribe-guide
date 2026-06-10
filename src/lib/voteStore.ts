import { getAdminClient } from './supabase/admin'

// Upvote counts for a set of listings (id → count). Empty input → empty map.
export async function getVoteCounts(resourceIds: string[]): Promise<Map<string, number>> {
  if (resourceIds.length === 0) return new Map()
  const { data, error } = await getAdminClient()
    .from('vote')
    .select('resource_id')
    .in('resource_id', resourceIds)

  if (error) throw new Error(`Failed to load votes: ${error.message}`)
  const counts = new Map<string, number>()
  for (const r of data as { resource_id: string }[]) {
    counts.set(r.resource_id, (counts.get(r.resource_id) ?? 0) + 1)
  }
  return counts
}

// Toggles a browser token's vote on a listing. Returns the new state + count.
export async function toggleVote(
  resourceId: string,
  token: string,
): Promise<{ voted: boolean; count: number }> {
  const supabase = getAdminClient()

  const { data: existing } = await supabase
    .from('vote')
    .select('resource_id')
    .eq('resource_id', resourceId)
    .eq('voter_token', token)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('vote')
      .delete()
      .eq('resource_id', resourceId)
      .eq('voter_token', token)
    if (error) throw new Error(`Failed to remove vote: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('vote')
      .insert({ resource_id: resourceId, voter_token: token })
    if (error) throw new Error(`Failed to add vote: ${error.message}`)
  }

  const { count, error: countErr } = await supabase
    .from('vote')
    .select('*', { count: 'exact', head: true })
    .eq('resource_id', resourceId)
  if (countErr) throw new Error(`Failed to count votes: ${countErr.message}`)

  return { voted: !existing, count: count ?? 0 }
}
