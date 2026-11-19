import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { makeCategory } from '@/test/providerFixtures'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  categoryDeleteCounts: vi.fn(),
  revalidatePublicContent: vi.fn(),
  clearCategoryFieldData: vi.fn(),
  filesInRow: vi.fn(),
  removeLaterIfUnused: vi.fn(),
}))
vi.mock('@/lib/storedFiles', () => ({ filesInRow: m.filesInRow, removeLaterIfUnused: m.removeLaterIfUnused }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
}))
vi.mock('@/lib/categoryStore', () => ({ updateCategory: m.updateCategory, deleteCategory: m.deleteCategory, categoryDeleteCounts: m.categoryDeleteCounts }))
vi.mock('@/lib/resourceStore', () => ({ clearCategoryFieldData: m.clearCategoryFieldData, applyFieldOptionRenames: vi.fn() }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))

const { PATCH, DELETE } = await import('./route')
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
  m.filesInRow.mockResolvedValue(['category-band/0-old.jpeg'])
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

  it('says it isn’t set up yet when the database has no group_by column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'group_by' column of 'category' in the schema cache"))
    const res = await patch({ groupBy: { kind: 'open' } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/n’t set up on this site yet/)
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

  it('says it isn’t set up yet when the database has no question_card column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'question_card' column of 'category' in the schema cache"))
    const res = await patch({ questionCard: { kind: 'confirm' } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/n’t set up on this site yet/)
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

  it('says it isn’t set up yet when the database has no walk_list column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'walk_list' column of 'category' in the schema cache"))
    const res = await patch({ walkList: lists })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/n’t set up on this site yet/)
  })
})

// The main card and the Shabbos card (listingParts.ts).
describe('PATCH /api/admin/categories/:id — what each listing adds', () => {
  it('saves only the parts it knows', async () => {
    await patch({ listingParts: { main: { title: ' Who to call first ', fields: ['who', 'who', 7] }, setLocation: true, extra: 1 } })
    expect(m.updateCategory).toHaveBeenLastCalledWith(
      'philly',
      'synagogue',
      expect.objectContaining({ listingParts: { main: { title: 'Who to call first', fields: ['who'] } } }),
    )
    expect((await patch({ listingParts: null })).status).toBe(200)
    expect(m.updateCategory).toHaveBeenLastCalledWith('philly', 'synagogue', expect.objectContaining({ listingParts: null }))
  })

  it('says it isn’t set up yet when the database has no listing_parts column yet', async () => {
    m.updateCategory.mockRejectedValue(new Error("Failed to update category: Could not find the 'listing_parts' column of 'category' in the schema cache"))
    const res = await patch({ listingParts: { shabbos: { fields: ['eruv'] } } })
    expect(res.status).toBe(502)
    expect((await res.json()).errors[0]).toMatch(/n’t set up on this site yet/)
  })
})

// The Eruv's confirm says how many eruvim and watches go with it (Nov 4).
// A category's id is its address, and every other row that names it
// (banners, home sections, Right now, tabs, subscribers, pending
// suggestions) points at it. No screen has offered to change it since Nov 5,
// and a rename moved only the listings, so the route no longer takes one.
describe('PATCH /api/admin/categories/:id — its id', () => {
  it('leaves the id as it is when a body names a new one', async () => {
    const res = await patch({ label: 'Shuls', newId: 'shuls' })
    expect(res.status).toBe(200)
    expect(m.updateCategory).toHaveBeenCalledWith('philly', 'synagogue', expect.anything())
    expect(m.updateCategory).not.toHaveBeenCalledWith('philly', 'shuls', expect.anything())
  })
})

describe('DELETE /api/admin/categories/:id', () => {
  const del = (q = '') =>
    DELETE(
      new Request(`http://x/api/admin/categories/eruv-information?community=philly${q}`, { method: 'DELETE' }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'eruv-information' }) },
    )

  it('?dry=1 only counts what would go', async () => {
    m.categoryDeleteCounts.mockResolvedValue({ listings: 0, eruvim: 4, watches: 3 })
    expect(await (await del('&dry=1')).json()).toEqual({ ok: true, listings: 0, eruvim: 4, watches: 3 })
    expect(m.deleteCategory).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('deletes, and says what went', async () => {
    m.deleteCategory.mockResolvedValue({ listings: 0, eruvim: 4, watches: 3 })
    expect(await (await del()).json()).toEqual({ ok: true, listings: 0, eruvim: 4, watches: 3 })
    expect(m.deleteCategory).toHaveBeenCalledWith('philly', 'eruv-information')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })
})

// A save that wrote and then failed used to answer its 502 without throwing
// the cached site away, so the site kept the old copy for days while the
// database held the new one (the admin review, Nov 18). adminWrite now
// invalidates after anything but a refusal.
describe('PATCH /api/admin/categories/:id — a save that fails partway', () => {
  it('still drops the cached site when the update failed (it may have written)', async () => {
    m.updateCategory.mockRejectedValue(new Error('connection reset'))
    expect((await patch({ label: 'Shuls' })).status).toBe(502)
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('still drops it when the category saved and clearing a field’s data failed', async () => {
    m.clearCategoryFieldData.mockRejectedValue(new Error('timeout'))
    expect((await patch({ hasPhone: false, clearFields: { phone: true } })).status).toBe(502)
    expect(m.updateCategory).toHaveBeenCalled()
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('refuses a bad pin colour before writing anything, and leaves the cache', async () => {
    expect((await patch({ label: 'Shuls', pinColor: 'blue' })).status).toBe(400)
    expect(m.updateCategory).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })
})

// Nov 19: a replaced banner, or a deleted category's pictures, used to stay
// in storage for good.
describe('/api/admin/categories/:id — the files a save stops using', () => {
  const del = (dry = false) =>
    DELETE(
      new Request(`http://x/api/admin/categories/synagogue?community=philly${dry ? '&dry=1' : ''}`, { method: 'DELETE' }) as unknown as NextRequest,
      { params: Promise.resolve({ id: 'synagogue' }) },
    )

  it('a save reads the row’s files first and clears the unused ones after', async () => {
    m.updateCategory.mockImplementation(async () => {
      expect(m.filesInRow).toHaveBeenCalledWith('category', { community_id: 'philly', id: 'synagogue' })
      return makeCategory({ id: 'synagogue' })
    })
    expect((await patch({ cardBandImageUrl: 'https://example.com/b.jpg' })).status).toBe(200)
    expect(m.removeLaterIfUnused).toHaveBeenCalledWith(['category-band/0-old.jpeg'], 'category')
  })

  it('nothing when the category isn’t there, or the save is refused', async () => {
    m.updateCategory.mockResolvedValue(null)
    expect((await patch({ label: 'Shuls' })).status).toBe(404)
    expect((await patch({ label: ' ' })).status).toBe(400)
    expect(m.removeLaterIfUnused).not.toHaveBeenCalled()
  })

  it('deleting it clears its pictures; counting what would go clears nothing', async () => {
    m.categoryDeleteCounts.mockResolvedValue({ listings: 0 })
    await del(true)
    expect(m.removeLaterIfUnused).not.toHaveBeenCalled()
    m.deleteCategory.mockResolvedValue({ listings: 0 })
    expect((await del()).status).toBe(200)
    expect(m.removeLaterIfUnused).toHaveBeenCalledWith(['category-band/0-old.jpeg'], 'category')
  })
})
