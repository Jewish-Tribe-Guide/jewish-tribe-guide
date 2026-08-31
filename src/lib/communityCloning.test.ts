import { afterEach, describe, expect, it, vi } from 'vitest'

// Same chainable-Supabase-mock pattern as categoryStore.test.ts/
// communityStore.test.ts. Calls happen in a fixed order (select categories,
// insert categories, select home_sections, insert home_sections), so each
// test lines up one chainable per call via mockReturnValueOnce rather than a
// single shared one.
function chainable(result: unknown) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  Object.assign(builder, {
    select: vi.fn(self),
    eq: vi.fn(self),
    insert: vi.fn(self),
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return builder
}

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const { cloneCommunityContent } = await import('./communityCloning')

afterEach(() => {
  mockFrom.mockReset()
})

const groceryRow = {
  id: 'grocery',
  community_id: 'philly',
  label: 'Grocery Store',
  plural_label: 'Grocery Stores',
  icon: '🛒',
  created_at: '2026-01-01T00:00:00.000Z',
}

const featuredSection = {
  id: 'featured',
  community_id: 'philly',
  kind: 'section',
  title: 'Popular right now',
  sort_order: 100,
  card_ids: ['grocery'],
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('cloneCommunityContent', () => {
  it('copies every source category under the target community_id, keeping the same id and stripping created_at', async () => {
    const selectCategories = chainable({ data: [groceryRow], error: null })
    const insertCategories = chainable({ error: null })
    const selectSections = chainable({ data: [], error: null })
    mockFrom
      .mockReturnValueOnce(selectCategories)
      .mockReturnValueOnce(insertCategories)
      .mockReturnValueOnce(selectSections)

    await cloneCommunityContent('ues', 'philly')

    expect(insertCategories.insert).toHaveBeenCalledWith([
      {
        id: 'grocery',
        community_id: 'ues',
        label: 'Grocery Store',
        plural_label: 'Grocery Stores',
        icon: '🛒',
      },
    ])
  })

  it('copies every source home section the same way', async () => {
    const selectCategories = chainable({ data: [], error: null })
    const selectSections = chainable({ data: [featuredSection], error: null })
    const insertSections = chainable({ error: null })
    mockFrom.mockReturnValueOnce(selectCategories).mockReturnValueOnce(selectSections).mockReturnValueOnce(insertSections)

    await cloneCommunityContent('ues', 'philly')

    expect(insertSections.insert).toHaveBeenCalledWith([
      {
        id: 'featured',
        community_id: 'ues',
        kind: 'section',
        title: 'Popular right now',
        sort_order: 100,
        card_ids: ['grocery'],
      },
    ])
  })

  it('does nothing (no insert calls) when the source has no categories or sections', async () => {
    const selectCategories = chainable({ data: [], error: null })
    const selectSections = chainable({ data: [], error: null })
    mockFrom.mockReturnValueOnce(selectCategories).mockReturnValueOnce(selectSections)

    await cloneCommunityContent('ues', 'philly')

    // Only the two reads happened — from() was never called a third time to insert.
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('throws with the Supabase error message when reading source categories fails', async () => {
    mockFrom.mockReturnValueOnce(chainable({ data: null, error: { message: 'boom' } }))
    await expect(cloneCommunityContent('ues', 'philly')).rejects.toThrow('Failed to read source categories: boom')
  })

  it('throws with the Supabase error message when inserting cloned categories fails', async () => {
    const selectCategories = chainable({ data: [groceryRow], error: null })
    const insertCategories = chainable({ error: { message: 'insert failed' } })
    mockFrom.mockReturnValueOnce(selectCategories).mockReturnValueOnce(insertCategories)

    await expect(cloneCommunityContent('ues', 'philly')).rejects.toThrow('Failed to clone categories: insert failed')
  })

  it('throws with the Supabase error message when reading source home sections fails', async () => {
    const selectCategories = chainable({ data: [], error: null })
    mockFrom.mockReturnValueOnce(selectCategories).mockReturnValueOnce(chainable({ data: null, error: { message: 'down' } }))

    await expect(cloneCommunityContent('ues', 'philly')).rejects.toThrow('Failed to read source home sections: down')
  })

  it('throws with the Supabase error message when inserting cloned home sections fails', async () => {
    const selectCategories = chainable({ data: [], error: null })
    const selectSections = chainable({ data: [featuredSection], error: null })
    const insertSections = chainable({ error: { message: 'conflict' } })
    mockFrom.mockReturnValueOnce(selectCategories).mockReturnValueOnce(selectSections).mockReturnValueOnce(insertSections)

    await expect(cloneCommunityContent('ues', 'philly')).rejects.toThrow('Failed to clone home sections: conflict')
  })
})
