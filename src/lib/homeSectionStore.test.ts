import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
}))

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    order: vi.fn(self),
    insert: vi.fn(self),
    upsert: vi.fn(self),
    update: vi.fn(self),
    delete: vi.fn(self),
    single: vi.fn(self),
    maybeSingle: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { listHomeSectionsUncached, createHomeSection, updateHomeSection, deleteHomeSection } =
  await import('./homeSectionStore')

afterEach(() => {
  mockFrom.mockReset()
})

const rawRow = { id: 'featured', title: 'Featured', sort_order: 100, card_ids: ['a', 'b'] }

describe('listHomeSectionsUncached', () => {
  it('maps rows, defaulting card_ids to an empty array', async () => {
    mockFrom.mockReturnValue(chainable({ data: [{ ...rawRow, card_ids: null }], error: null }))
    const [section] = await listHomeSectionsUncached('philly')
    expect(section.cardIds).toEqual([])
    expect(section.sortOrder).toBe(100)
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(listHomeSectionsUncached('philly')).rejects.toThrow('Failed to load home sections: boom')
  })

  describe('kind', () => {
    it('defaults a row with no kind column (pre-migration) to "section"', async () => {
      mockFrom.mockReturnValue(chainable({ data: [{ ...rawRow, kind: undefined }], error: null }))
      const [section] = await listHomeSectionsUncached('philly')
      expect(section.kind).toBe('section')
    })

    it('maps a real kind straight through', async () => {
      mockFrom.mockReturnValue(chainable({ data: [{ ...rawRow, id: 'map', kind: 'map' }], error: null }))
      const [section] = await listHomeSectionsUncached('philly')
      expect(section.kind).toBe('map')
    })

    it('overrides a built-in row’s title with the fixed BUILT_IN_BLOCKS label, ignoring whatever the row holds', async () => {
      mockFrom.mockReturnValue(
        chainable({ data: [{ ...rawRow, id: 'zmanim', kind: 'zmanim', title: 'stale saved title' }], error: null }),
      )
      const [section] = await listHomeSectionsUncached('philly')
      expect(section.title).toBe('Zmanim & Shabbos')
    })
  })
})

describe('createHomeSection', () => {
  it('appends -2, -3, ... until it finds a free slug', async () => {
    let checkCall = 0
    const countBuilder = chainable({ count: 0, error: null, data: null })
    const insertBuilder = chainable({ data: { ...rawRow, id: 'nearby-2' }, error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'home_section') throw new Error('unexpected table')
      checkCall += 1
      if (checkCall === 1) return chainable({ data: { id: 'nearby' }, error: null })
      if (checkCall === 2) return chainable({ data: null, error: null })
      if (checkCall === 3) return countBuilder
      return insertBuilder
    })

    const result = await createHomeSection({ title: 'Nearby' })
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'nearby-2' }))
    expect(result.id).toBe('nearby-2')
  })

  it('starts empty (no cards) and sorts last: sortOrder = (existing count + 1) * 100', async () => {
    let call = 0
    const insertBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: null, error: null }) // slug free
      if (call === 2) return chainable({ count: 2, error: null, data: null }) // 2 existing sections
      return insertBuilder
    })

    await createHomeSection({ title: 'New Section' })

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ card_ids: [], sort_order: 300 }),
    )
  })

  it('defaults sortOrder to 100 when no sections exist yet (count null)', async () => {
    let call = 0
    const insertBuilder = chainable({ data: rawRow, error: null })
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: null, error: null })
      if (call === 2) return chainable({ count: null, error: null, data: null })
      return insertBuilder
    })

    await createHomeSection({ title: 'First Section' })

    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 100 }))
  })

  it('throws with the Supabase error message on insert failure', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      if (call === 1) return chainable({ data: null, error: null })
      if (call === 2) return chainable({ count: 0, error: null, data: null })
      return chainable({ data: null, error: { message: 'boom' } })
    })
    await expect(createHomeSection({ title: 'X' })).rejects.toThrow('Failed to create section: boom')
  })

  // A built-in block (kind !== 'section') skips the slugify/insert path
  // entirely — fixed id/title, and upserts rather than inserts, since
  // "+ Add block" re-adding one has to succeed even if a row for that exact
  // id already exists (e.g. from the one-time seed-home-blocks.mjs backfill,
  // or a previous session).
  describe('built-in blocks (kind set)', () => {
    it('upserts with the fixed id/title from BUILT_IN_BLOCKS, ignoring the given title/cardIds', async () => {
      let call = 0
      const upsertBuilder = chainable({ data: { id: 'map', kind: 'map', title: 'Explore the map', sort_order: 100, card_ids: [] }, error: null })
      mockFrom.mockImplementation(() => {
        call += 1
        if (call === 1) return chainable({ count: 1, error: null, data: null })
        return upsertBuilder
      })

      const result = await createHomeSection({ title: 'ignored', cardIds: ['ignored'], kind: 'map' })

      expect(upsertBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'map', kind: 'map', title: 'Explore the map', card_ids: [] }),
        { onConflict: 'community_id,id' },
      )
      expect(result.id).toBe('map')
      expect(result.kind).toBe('map')
    })

    it('throws a message naming the block on failure', async () => {
      let call = 0
      mockFrom.mockImplementation(() => {
        call += 1
        if (call === 1) return chainable({ count: 0, error: null, data: null })
        return chainable({ data: null, error: { message: 'boom' } })
      })
      await expect(createHomeSection({ title: '', kind: 'zmanim' })).rejects.toThrow(
        'Failed to add Zmanim & Shabbos: boom',
      )
    })
  })
})

describe('updateHomeSection', () => {
  it('reads without writing when the patch has no keys set', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateHomeSection('featured', {})

    expect(result?.id).toBe('featured')
    expect(builder.update).not.toHaveBeenCalled()
  })

  it('only writes the columns present in the patch', async () => {
    const builder = chainable({ data: rawRow, error: null })
    mockFrom.mockReturnValue(builder)

    await updateHomeSection('featured', { title: '  New Title  ' })

    expect(builder.update).toHaveBeenCalledWith({ title: 'New Title' })
  })

  it('returns null when no row matches the id', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))
    expect(await updateHomeSection('missing', { sortOrder: 1 })).toBeNull()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ data: null, error: { message: 'boom' } }))
    await expect(updateHomeSection('featured', { sortOrder: 1 })).rejects.toThrow(
      'Failed to update section: boom',
    )
  })
})

describe('deleteHomeSection', () => {
  it('resolves without error on success', async () => {
    mockFrom.mockReturnValue(chainable({ error: null }))
    await expect(deleteHomeSection('featured')).resolves.toBeUndefined()
  })

  it('throws with the Supabase error message on failure', async () => {
    mockFrom.mockReturnValue(chainable({ error: { message: 'boom' } }))
    await expect(deleteHomeSection('featured')).rejects.toThrow('Failed to delete section: boom')
  })
})
