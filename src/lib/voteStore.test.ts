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
const mockRpc = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

const { getVoteCounts, getVotedResourceIds, toggleVote } = await import('./voteStore')

afterEach(() => {
  mockFrom.mockReset()
  mockRpc.mockReset()
})

describe('getVoteCounts', () => {
  it('tallies one count per resource id, for however many vote rows it has', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [{ resource_id: 'a' }, { resource_id: 'a' }, { resource_id: 'b' }],
        error: null,
      }),
    )

    const result = await getVoteCounts('philly')

    expect(result).toEqual(new Map([['a', 2], ['b', 1]]))
    expect(result.has('c')).toBe(false)
  })

  it('scopes by the listing\'s community via a join, never by a list of ids', async () => {
    const builder = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getVoteCounts('philly')

    expect(builder.select).toHaveBeenCalledWith('resource_id, resource!inner(community_id)')
    expect(builder.eq).toHaveBeenCalledWith('resource.community_id', 'philly')
    // The `in (…ids)` form is what put every listing id in the URL.
    expect(builder.in).not.toHaveBeenCalled()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'timeout' } }))
    await expect(getVoteCounts('philly')).rejects.toThrow('Failed to load votes: timeout')
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
  it('makes exactly one atomic rpc call and touches no table directly', async () => {
    mockRpc.mockResolvedValue({ data: [{ voted: true, vote_count: 3 }], error: null })

    const result = await toggleVote('resource-1', 'token-1')

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('toggle_vote', { p_resource_id: 'resource-1', p_token: 'token-1' })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(result).toEqual({ voted: true, count: 3 })
  })

  it('reports a removal, and coerces a bigint-as-string count', async () => {
    mockRpc.mockResolvedValue({ data: [{ voted: false, vote_count: '2' }], error: null })
    expect(await toggleVote('resource-1', 'token-1')).toEqual({ voted: false, count: 2 })
  })

  it('throws with the Supabase error message on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fk violation' } })
    await expect(toggleVote('resource-1', 'token-1')).rejects.toThrow('Failed to toggle vote: fk violation')
  })

  it('throws on an empty response rather than reporting a made-up state', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await expect(toggleVote('resource-1', 'token-1')).rejects.toThrow('empty response')
  })
})
