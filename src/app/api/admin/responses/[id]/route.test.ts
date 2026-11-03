import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  updateFormResponse: vi.fn(),
  deleteFormResponse: vi.fn(),
  resolveCommunity: vi.fn(),
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/formResponseStore', () => ({ updateFormResponse: m.updateFormResponse, deleteFormResponse: m.deleteFormResponse }))
vi.mock('@/lib/communityStore', () => ({
  resolveCommunity: m.resolveCommunity,
  communitySlugFromRequest: () => 'philly',
}))

const { PATCH } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'r1' }) } as never
const patch = (body: unknown) => PATCH(new Request('http://x/api/admin/responses/r1', { method: 'PATCH', body: JSON.stringify(body) }) as never, ctx)

beforeEach(() => {
  vi.clearAllMocks()
  m.resolveCommunity.mockResolvedValue({ slug: 'philly' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'admin@example.com' })
  m.updateFormResponse.mockResolvedValue({ id: 'r1', status: 'handled' })
})

describe('PATCH /api/admin/responses/:id', () => {
  it('marks a response done, To do’s Done, without touching the public site', async () => {
    const res = await patch({ status: 'handled' })
    expect(res.status).toBe(200)
    expect(m.updateFormResponse).toHaveBeenCalledWith('r1', { status: 'handled' }, expect.objectContaining({ community: 'philly' }))
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('takes no other status', async () => {
    const res = await patch({ status: 'new' })
    expect(res.status).toBe(400)
    expect(m.updateFormResponse).not.toHaveBeenCalled()
  })

  it('a correction still reaches the public site', async () => {
    await patch({ data: { message: 'fixed' } })
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })
})
