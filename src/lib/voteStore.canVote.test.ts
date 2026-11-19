import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ row: null as unknown, listCategories: vi.fn() }))
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: m.row, error: null }) }
      return q
    },
  }),
}))
vi.mock('./categoryStore', () => ({ listCategories: m.listCategories }))

const { canVote } = await import('./voteStore')

beforeEach(() => {
  m.listCategories.mockResolvedValue([{ id: 'restaurant', upvotesEnabled: true }, { id: 'shul', upvotesEnabled: false }])
})

describe('canVote', () => {
  it('takes votes on an approved listing in a category with upvotes on', async () => {
    m.row = { status: 'approved', category: 'restaurant', community_id: 'philly' }
    expect(await canVote('r')).toBe(true)
    expect(m.listCategories).toHaveBeenCalledWith('philly')
  })

  it('refuses one waiting in the queue, gone, or in a category with upvotes off', async () => {
    for (const row of [
      { status: 'pending', category: 'restaurant', community_id: 'philly' },
      { status: 'approved', category: 'shul', community_id: 'philly' },
      null,
    ]) {
      m.row = row
      expect(await canVote('r')).toBe(false)
    }
  })
})
