import { afterEach, describe, expect, it, vi } from 'vitest'

// getAdminClient wraps the real Supabase client — mocked here as a minimal
// chainable query-builder stand-in (every method returns the same object,
// which is itself thenable) since nothing here needs real Postgres behavior,
// just to prove these functions build the right query/payload. The actual
// read/write behavior against a real project is what the integration suite
// (submissionStore.integration.test.ts) covers for the sibling stores.
function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    in: vi.fn(self),
    order: vi.fn(self),
    upsert: vi.fn(self),
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

const { listTags, upsertTags } = await import('./tagStore')

afterEach(() => {
  mockFrom.mockReset()
})

describe('listTags', () => {
  it('reads the tag table scoped to the community and group, ordered by label', async () => {
    const rows = [{ slug: 'ou', label: 'OU', group: 'kosher_product' }]
    const builder = chainable({ data: rows, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await listTags('philly', 'kosher_product')

    expect(mockFrom).toHaveBeenCalledWith('tag')
    expect(builder.eq).toHaveBeenCalledWith('community_id', 'philly')
    expect(builder.eq).toHaveBeenCalledWith('group', 'kosher_product')
    expect(builder.order).toHaveBeenCalledWith('label', { ascending: true })
    expect(result).toEqual(rows)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listTags('philly', 'kosher_product')).rejects.toThrow('Failed to load tags: boom')
  })
})

describe('upsertTags', () => {
  it('upserts one row per distinct, trimmed, non-empty label, with a slugified slug', async () => {
    const builder = chainable({ error: null })
    mockFrom.mockReturnValue(builder)

    await upsertTags('philly', ['  Kof-K  ', 'OU', 'OU', '', '   '], 'kosher_product')

    expect(mockFrom).toHaveBeenCalledWith('tag')
    expect(builder.upsert).toHaveBeenCalledWith(
      [
        { community_id: 'philly', slug: 'kof-k', label: 'Kof-K', group: 'kosher_product' },
        { community_id: 'philly', slug: 'ou', label: 'OU', group: 'kosher_product' },
      ],
      { onConflict: 'community_id,slug' },
    )
  })

  it('is a no-op (no query at all) when every label is blank', async () => {
    await upsertTags('philly', ['', '   '], 'kosher_product')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ error: { message: 'conflict' } }))
    await expect(upsertTags('philly', ['OU'], 'kosher_product')).rejects.toThrow(
      'Failed to upsert tags: conflict',
    )
  })
})
