import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  updateCategory: vi.fn(),
  revalidatePublicContent: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ updateCategory: m.updateCategory, deleteCategory: vi.fn(), renameCategoryId: vi.fn() }))
vi.mock('@/lib/resourceStore', () => ({ clearCategoryFieldData: vi.fn(), applyFieldOptionRenames: vi.fn() }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { PATCH } = await import('./route')
const patch = (body: unknown) =>
  PATCH(
    new Request('http://x/api/admin/categories/synagogue?community=philly', { method: 'PATCH', body: JSON.stringify(body) }) as unknown as NextRequest,
    { params: Promise.resolve({ id: 'synagogue' }) },
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.updateCategory.mockResolvedValue(makeCategory({ id: 'synagogue' }))
})

// How a category page groups its list (listGroups.ts).
describe('PATCH /api/admin/categories/:id — grouping the list', () => {
  it('saves a grouping it knows, and clearing it back to one list', async () => {
    expect((await patch({ groupBy: { kind: 'field', key: 'denomination' } })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ groupBy: { kind: 'field', key: 'denomination' } }))
    expect((await patch({ groupBy: null })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ groupBy: null }))
  })

  it('refuses one it doesn’t know, rather than saving what would read back as no groups', async () => {
    const res = await patch({ groupBy: { kind: 'colour' } })
    expect(res.status).toBe(400)
    expect(m.updateCategory).not.toHaveBeenCalled()
  })

  it('saves only the parts it knows of a grouping', async () => {
    await patch({ groupBy: { kind: 'open', extra: '<script>' } })
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ groupBy: { kind: 'open' } }))
  })

  it('says the migration is missing when the database has no group_by column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'group_by' column of 'category' in the schema cache"))
    const res = await patch({ groupBy: { kind: 'open' } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/migration 059/)
  })
})

// The one question the list asks (questionCards.ts).
describe('PATCH /api/admin/categories/:id — the question card', () => {
  it('saves a question it knows, and clearing it back to none', async () => {
    expect((await patch({ questionCard: { kind: 'field', key: 't' } })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ questionCard: { kind: 'field', key: 't' } }))
    expect((await patch({ questionCard: null })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ questionCard: null }))
  })

  it('refuses one it doesn’t know, and saves only the parts it knows of one it does', async () => {
    expect((await patch({ questionCard: { kind: 'poll' } })).status).toBe(400)
    expect(m.updateCategory).not.toHaveBeenCalled()
    await patch({ questionCard: { kind: 'confirm', extra: '<script>' } })
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ questionCard: { kind: 'confirm' } }))
  })

  it('says the migration is missing when the database has no question_card column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'question_card' column of 'category' in the schema cache"))
    const res = await patch({ questionCard: { kind: 'confirm' } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/migration 060/)
  })
})

// Other categories' places within a walk (walkList.ts).
describe('PATCH /api/admin/categories/:id — places within a walk', () => {
  const lists = [
    { categoryId: 'restaurant', maxMinutes: 30, groupBy: 'foodType' },
    { categoryId: 'synagogue', maxMinutes: 30 },
  ]

  it('saves the lists it knows, and clearing them back to none', async () => {
    expect((await patch({ walkList: lists })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ walkList: lists }))
    expect((await patch({ walkList: null })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ walkList: null }))
  })

  it('refuses a list it doesn’t know, or two of the same places, and saves only the parts it knows of the rest', async () => {
    expect((await patch({ walkList: [{ categoryId: 'synagogue', maxMinutes: 240 }] })).status).toBe(400)
    expect((await patch({ walkList: [{ maxMinutes: 30 }] })).status).toBe(400)
    expect((await patch({ walkList: [lists[1], lists[1]] })).status).toBe(400)
    expect((await patch({ walkList: lists[1] })).status).toBe(400)
    expect(m.updateCategory).not.toHaveBeenCalled()
    await patch({ walkList: [{ categoryId: 'synagogue', maxMinutes: 15, extra: '<script>' }] })
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ walkList: [{ categoryId: 'synagogue', maxMinutes: 15 }] }))
  })

  it('says the migration is missing when the database has no walk_list column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'walk_list' column of 'category' in the schema cache"))
    const res = await patch({ walkList: lists })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/migration 061/)
  })
})

// The main card, the Shabbos card and Set as location (listingParts.ts).
describe('PATCH /api/admin/categories/:id — what each listing adds', () => {
  it('saves only the parts it knows', async () => {
    await patch({ listingParts: { main: { title: ' Who to call first ', fields: ['who', 'who', 7] }, setLocation: true, extra: 1 } })
    expect(m.updateCategory).toHaveBeenLastCalledWith(
      'philly',
      'synagogue',
      expect.objectContaining({ listingParts: { main: { title: 'Who to call first', fields: ['who'] }, setLocation: true } }),
    )
    expect((await patch({ listingParts: null })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ listingParts: null }))
  })

  it('says the migration is missing when the database has no listing_parts column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'listing_parts' column of 'category' in the schema cache"))
    const res = await patch({ listingParts: { setLocation: true } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/migration 066/)
  })
})
