import { afterEach, describe, expect, it, vi } from 'vitest'

// Same chainable Supabase query-builder stand-in as tagStore.test.ts — see
// that file's comment for why.
function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    in: vi.fn(self),
    order: vi.fn(self),
    insert: vi.fn(self),
    delete: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { getVoteCounts, getVotedResourceIds, toggleVote } = await import('./voteStore')

afterEach(() => {
  mockFrom.mockReset()
})

describe('getVoteCounts', () => {
  it('returns an empty map without querying at all for an empty input', async () => {
    const result = await getVoteCounts([])
    expect(result).toEqual(new Map())
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('tallies one count per resource id, for however many vote rows it has', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ resource_id: 'a' }, { resource_id: 'a' }, { resource_id: 'b' }],
        error: null,
      }),
    )

    const result = await getVoteCounts(['a', 'b', 'c'])

    expect(result).toEqual(new Map([['a', 2], ['b', 1]]))
    expect(result.has('c')).toBe(false)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'timeout' } }))
    await expect(getVoteCounts(['a'])).rejects.toThrow('Failed to load votes: timeout')
  })
})

describe('getVotedResourceIds', () => {
  it('returns the resource ids this token voted on', async () => {
    const builder = chainable({ data: [{ resource_id: 'x' }, { resource_id: 'y' }], error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getVotedResourceIds('token-1')

    expect(builder.eq).toHaveBeenCalledWith('voter_token', 'token-1')
    expect(result).toEqual(['x', 'y'])
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'down' } }))
    await expect(getVotedResourceIds('token-1')).rejects.toThrow('Failed to load your votes: down')
  })
})

describe('toggleVote', () => {
  it('adds a vote (insert) when the token has not voted yet, and returns the new count', async () => {
    mockFrom
      .mockReturnValueOnce(chainable({ data: null })) // existing-vote lookup: none
      .mockReturnValueOnce(chainable({ error: null })) // insert
      .mockReturnValueOnce(chainable({ count: 3, error: null })) // count

    const result = await toggleVote('resource-1', 'token-1')

    expect(result).toEqual({ voted: true, count: 3 })
  })

  it('removes a vote (delete) when the token already voted, and returns the new count', async () => {
    mockFrom
      .mockReturnValueOnce(chainable({ data: { resource_id: 'resource-1' } })) // existing-vote lookup: found
      .mockReturnValueOnce(chainable({ error: null })) // delete
      .mockReturnValueOnce(chainable({ count: 2, error: null })) // count

    const result = await toggleVote('resource-1', 'token-1')

    expect(result).toEqual({ voted: false, count: 2 })
  })

  it('throws with the Supabase error message when the insert fails', async () => {
    mockFrom
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ error: { message: 'duplicate' } }))

    await expect(toggleVote('resource-1', 'token-1')).rejects.toThrow('Failed to add vote: duplicate')
  })
})
