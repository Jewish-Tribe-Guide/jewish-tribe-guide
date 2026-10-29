import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  getResourceRowById: vi.fn(),
  validateSubmission: vi.fn(),
  submitListingUpdate: vi.fn(),
  submitListingDelete: vi.fn(),
  approveSubmission: vi.fn(),
  runWalkRoutesAfterChange: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void m.afterCallbacks.push(fn) }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/resourceStore', () => ({
  validateSubmission: m.validateSubmission,
  getResourceRowById: m.getResourceRowById,
  normalizeRow: (r: { id: string }) => r,
}))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: async () => ({ id: 'food', detailFields: [{ key: 'w', type: 'url' }] }) }))
vi.mock('@/lib/submissionStore', () => ({
  submitListingUpdate: m.submitListingUpdate,
  submitListingDelete: m.submitListingDelete,
  approveSubmission: m.approveSubmission,
}))
vi.mock('@/lib/communityStore', () => ({ resolveCommunity: async () => ({ slug: 'philly' }), communitySlugFromRequest: () => 'philly' }))
vi.mock('@/lib/walkRouteJob', () => ({ runWalkRoutesAfterChange: m.runWalkRoutesAfterChange }))

const { PATCH, DELETE } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'res1' }) } as never
const payload = { category: 'food', name: 'Goldie', address: '1 Main St', details: { w: 'goldie.com' } }
const update = (body: unknown = { payload }) => PATCH(new Request('http://x/api/admin/listings/res1', { method: 'PATCH', body: JSON.stringify(body) }) as never, ctx)
const archive = () => DELETE(new Request('http://x/api/admin/listings/res1', { method: 'DELETE' }) as never, ctx)

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'admin@x.co' })
  m.getResourceRowById.mockResolvedValue({ id: 'res1', status: 'approved' })
  m.validateSubmission.mockReturnValue([])
  m.submitListingUpdate.mockResolvedValue({ id: 'sub1' })
  m.submitListingDelete.mockResolvedValue({ id: 'sub2' })
  m.approveSubmission.mockResolvedValue({})
  m.revalidatePublicContent.mockResolvedValue(undefined)
})

describe('PATCH /api/admin/listings/:id', () => {
  it('files the edit as the admin’s and approves it on the spot', async () => {
    expect((await update()).status).toBe(200)
    expect(m.submitListingUpdate).toHaveBeenCalledWith('philly', 'res1', expect.objectContaining({ name: 'Goldie', details: { w: 'https://goldie.com' } }), null, { name: 'admin@x.co', email: 'admin@x.co' })
    expect(m.approveSubmission).toHaveBeenCalledWith('sub1', 'philly', 'admin@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
    for (const fn of m.afterCallbacks.splice(0)) await fn()
    expect(m.runWalkRoutesAfterChange).toHaveBeenCalledWith('philly')
  })

  it('refuses a listing that doesn’t pass, and files nothing', async () => {
    m.validateSubmission.mockReturnValue(['Address is required.'])
    const res = await update()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, errors: ['Address is required.'] })
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('won’t edit an archived or missing listing', async () => {
    m.getResourceRowById.mockResolvedValue({ id: 'res1', status: 'archived' })
    expect((await update()).status).toBe(404)
    m.getResourceRowById.mockResolvedValue(null)
    expect((await update()).status).toBe(404)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
  })

  it('is for admins only', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await update()).status).toBe(401)
    expect((await archive()).status).toBe(401)
    expect(m.submitListingUpdate).not.toHaveBeenCalled()
    expect(m.submitListingDelete).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/listings/:id', () => {
  it('archives it: a removal filed as the admin’s and approved', async () => {
    expect((await archive()).status).toBe(200)
    expect(m.submitListingDelete).toHaveBeenCalledWith('philly', 'res1', null, { name: 'admin@x.co', email: 'admin@x.co' })
    expect(m.approveSubmission).toHaveBeenCalledWith('sub2', 'philly', 'admin@x.co')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('won’t archive what isn’t on the site', async () => {
    m.getResourceRowById.mockResolvedValue({ id: 'res1', status: 'archived' })
    expect((await archive()).status).toBe(404)
    expect(m.submitListingDelete).not.toHaveBeenCalled()
  })
})
