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
