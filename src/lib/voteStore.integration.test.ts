import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// The vote path against a real Postgres. voteStore.test.ts mocks the Supabase
// client, which can't tell whether the toggle_vote() SQL function (migration
// 54) or the community-scoped count query actually do what the store assumes —
// that only shows up here. Same disposable test project, same cleanup-by-id
// discipline as submissionStore.integration.test.ts.
//
// Needs migration 20240101000054_toggle_vote_rpc.sql applied to that project.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}))

const { createCategory, deleteCategory } = await import('./categoryStore')
const { getAdminClient } = await import('./supabase/admin')
const { toggleVote, getVoteCounts, getVotedResourceIds } = await import('./voteStore')

const categories: { community: string; id: string }[] = []

afterEach(async () => {
  // Deleting the category removes its listings, and votes cascade from those.
  for (const c of categories.splice(0)) await deleteCategory(c.community, c.id)
})

/** A category with one approved listing, in the given community. */
async function makeListing(community: string): Promise<string> {
  const category = await createCategory(community, { label: `Vote Test ${randomUUID().slice(0, 8)}` })
  categories.push({ community, id: category.id })

  const { data, error } = await getAdminClient()
    .from('resource')
    .insert({
      community_id: community,
      category: category.id,
      name: 'Vote test listing',
      anchor_id: 'community',
      address: '1 Test St',
      details: {},
      status: 'approved',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

async function rowCount(resourceId: string): Promise<number> {
  const { count } = await getAdminClient()
    .from('vote')
    .select('*', { count: 'exact', head: true })
    .eq('resource_id', resourceId)
  return count ?? 0
}

describe('toggleVote (integration)', () => {
  it('adds a vote, then removes it, with the right count each time', async () => {
    const id = await makeListing('philly')
    const token = randomUUID()

    expect(await toggleVote(id, token)).toEqual({ voted: true, count: 1 })
    expect(await getVotedResourceIds(token)).toEqual([id])

    expect(await toggleVote(id, token)).toEqual({ voted: false, count: 0 })
    expect(await getVotedResourceIds(token)).toEqual([])
  })

  it('counts one vote per browser token', async () => {
    const id = await makeListing('philly')

    await toggleVote(id, randomUUID())
    await toggleVote(id, randomUUID())
    const third = await toggleVote(id, randomUUID())

    expect(third).toEqual({ voted: true, count: 3 })
  })

  it('survives simultaneous toggles from one browser: no error, never more than one vote', async () => {
    const id = await makeListing('philly')
    const token = randomUUID()

    // The old select → write → count sequence could both see "not voted" and
    // both insert, tripping the primary key. Twenty at once makes that likely
    // if it were still possible.
    const results = await Promise.all(Array.from({ length: 20 }, () => toggleVote(id, token)))

    expect(results).toHaveLength(20)
    expect(await rowCount(id)).toBeLessThanOrEqual(1)
  })

  it('rejects a listing that does not exist, and writes nothing', async () => {
    const token = randomUUID()
    await expect(toggleVote(randomUUID(), token)).rejects.toThrow('Failed to toggle vote')
    expect(await getVotedResourceIds(token)).toEqual([])
  })
})

describe('getVoteCounts (integration)', () => {
  it('counts votes for a community, and only that community', async () => {
    const philly = await makeListing('philly')
    const ues = await makeListing('ues')
    await toggleVote(philly, randomUUID())
    await toggleVote(philly, randomUUID())
    await toggleVote(ues, randomUUID())

    const phillyCounts = await getVoteCounts('philly')
    const uesCounts = await getVoteCounts('ues')

    expect(phillyCounts.get(philly)).toBe(2)
    expect(phillyCounts.has(ues)).toBe(false)
    expect(uesCounts.get(ues)).toBe(1)
    expect(uesCounts.has(philly)).toBe(false)
  })
})
