import { afterEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('./supabase/admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

const mockList = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('./categoryStore', () => ({ listCategoriesUncached: mockList, createCategory: mockCreate }))

const { addMissingSiteScreens } = await import('./communityCloning')

afterEach(() => {
  mockFrom.mockReset()
})

describe('addMissingSiteScreens', () => {
  afterEach(() => {
    mockList.mockReset()
    mockCreate.mockReset()
  })

  it('starts an empty community with the Map, Candle Lighting and Eruv on', async () => {
    mockList.mockResolvedValue([])
    await addMissingSiteScreens('baltimore')
    expect(mockCreate.mock.calls.map(([c, input]) => [c, input.kind, input.active])).toEqual([
      ['baltimore', 'map', undefined],
      ['baltimore', 'zmanim', undefined],
      ['baltimore', 'eruv', undefined],
    ])
  })

  // A singleton's second row is refused by the database, which would fail
  // creating a community cloned from one that has them.
  it('adds only what a clone didn’t bring, leaving a hidden one hidden', async () => {
    mockList.mockResolvedValue([{ kind: 'map', active: false }, { kind: 'eruv', active: true }, { kind: 'listing' }])
    await addMissingSiteScreens('baltimore')
    expect(mockCreate.mock.calls.map(([, input]) => input.kind)).toEqual(['zmanim'])
  })
})
