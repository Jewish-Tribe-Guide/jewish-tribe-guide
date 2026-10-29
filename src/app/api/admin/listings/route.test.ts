import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  submitListingCreate: vi.fn(),
  approveSubmission: vi.fn(),
  getResourceRowById: vi.fn(),
  runWalkRoutesAfterChange: vi.fn(),
  listResourcesForAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void m.afterCallbacks.push(fn) }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/resourceStore', () => ({
  validateSubmission: () => [],
  getResourceRowById: m.getResourceRowById,
  normalizeRow: (r: { id: string }) => r,
  listResourcesForAdmin: m.listResourcesForAdmin,
  toAdminPlace: (r: { id: string }, takesAddress: boolean) => ({ id: r.id, takesAddress }),
}))
vi.mock('@/lib/categoryStore', () => ({
  getCategoryById: async () => ({ id: 'hotel', detailFields: [] }),
  listCategoriesUncached: async () => [{ id: 'hotel' }, { id: 'whatsapp', hasAddress: false }],
}))
vi.mock('@/lib/submissionStore', () => ({ submitListingCreate: m.submitListingCreate, approveSubmission: m.approveSubmission }))
vi.mock('@/lib/communityStore', () => ({ resolveCommunity: async () => ({ slug: 'philly' }), communitySlugFromRequest: () => 'philly' }))
vi.mock('@/lib/walkRouteJob', () => ({ runWalkRoutesAfterChange: m.runWalkRoutesAfterChange }))

const { GET, POST } = await import('./route')
const add = () =>
  POST(new Request('http://x/api/admin/listings', { method: 'POST', body: JSON.stringify({ payload: { category: 'hotel', name: 'Hotel Palomar' } }) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'admin@x.co' })
  m.submitListingCreate.mockResolvedValue({ id: 'sub1' })
  m.approveSubmission.mockResolvedValue({ target_id: 'res1' })
  m.getResourceRowById.mockResolvedValue({ id: 'res1' })
  m.revalidatePublicContent.mockResolvedValue(undefined)
})

describe('POST /api/admin/listings', () => {
  // Oct 15: a new listing's walks along the streets, now rather than tonight.
  it('adds it live, then works out its walks once the response is sent', async () => {
    expect(await (await add()).json()).toEqual({ ok: true, listing: { id: 'res1' } })
    expect(m.runWalkRoutesAfterChange).not.toHaveBeenCalled()
    for (const fn of m.afterCallbacks.splice(0)) await fn()
    expect(m.runWalkRoutesAfterChange).toHaveBeenCalledWith('philly')
  })
})

describe('GET /api/admin/listings', () => {
  const list = () => GET(new Request('http://x/api/admin/listings'))

  // Places (the admin redesign's step 3): every listing, with every
  // category, hidden ones too, and no "No address" for a category that
  // takes none.
  it('lists every listing for Places, with its categories', async () => {
    m.listResourcesForAdmin.mockResolvedValue([
      { id: 'a', category: 'hotel' },
      { id: 'b', category: 'whatsapp' },
    ])
    expect(await (await list()).json()).toEqual({
      ok: true,
      places: [
        { id: 'a', takesAddress: true },
        { id: 'b', takesAddress: false },
      ],
      categories: [{ id: 'hotel' }, { id: 'whatsapp', hasAddress: false }],
    })
    expect(m.listResourcesForAdmin).toHaveBeenCalledWith('philly')
  })

  it('is for admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await list()).status).toBe(401)
    expect(m.listResourcesForAdmin).not.toHaveBeenCalled()
  })
})
