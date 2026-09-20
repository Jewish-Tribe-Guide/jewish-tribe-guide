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

// Every resource this browser token has voted on — lets the client verify its
// own "did I vote" state against the real record instead of trusting a local
// cache that can be cleared/evicted independently of the vote itself (Safari's
// automatic storage eviction for infrequently-visited sites, a private window,
// "clear site data"). The vote row is the only durable copy of this; nothing
// server-side else remembers a browser's identity.
export async function getVotedResourceIds(token: string): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('vote')
    .select('resource_id')
    .eq('voter_token', token)

  if (error) throw new Error(`Failed to load your votes: ${error.message}`)
  return (data as { resource_id: string }[]).map((r) => r.resource_id)
}

// Toggles a browser token's vote on a listing. Returns the new state + count.
// One atomic call (see the toggle_vote migration) — the old select/write/count
// sequence let two quick taps race between the select and the write.
export async function toggleVote(
  resourceId: string,
  token: string,
): Promise<{ voted: boolean; count: number }> {
  const { data, error } = await getAdminClient().rpc('toggle_vote', {
    p_resource_id: resourceId,
    p_token: token,
  })
  if (error) throw new Error(`Failed to toggle vote: ${error.message}`)

  const row = (data as { voted: boolean; vote_count: number | string }[] | null)?.[0]
  if (!row) throw new Error('Failed to toggle vote: empty response')
  // bigint comes back as a string from some PostgREST configurations.
  return { voted: row.voted, count: Number(row.vote_count) }
}
