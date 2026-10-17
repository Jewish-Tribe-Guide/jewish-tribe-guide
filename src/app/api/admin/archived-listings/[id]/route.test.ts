import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  restoreResource: vi.fn(),
  runWalkRoutesAfterChange: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void m.afterCallbacks.push(fn) }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/resourceStore', () => ({ restoreResource: m.restoreResource, hardDeleteArchivedResource: vi.fn() }))
vi.mock('@/lib/communityStore', () => ({ resolveCommunity: async () => ({ slug: 'philly' }), communitySlugFromRequest: () => 'philly' }))
vi.mock('@/lib/walkRouteJob', () => ({ runWalkRoutesAfterChange: m.runWalkRoutesAfterChange }))

const { PATCH } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'res1' }) } as never
const restore = () => PATCH(new Request('http://x/api/admin/archived-listings/res1', { method: 'PATCH' }) as never, ctx)

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'admin@x.co' })
  m.revalidatePublicContent.mockResolvedValue(undefined)
})

describe('PATCH /api/admin/archived-listings/:id', () => {
  // Oct 15: a listing back is a place with walks to work out, now.
  it('restores it, then works out its walks once the response is sent', async () => {
    m.restoreResource.mockResolvedValue({ id: 'res1' })
    expect((await restore()).status).toBe(200)
    expect(m.runWalkRoutesAfterChange).not.toHaveBeenCalled()
    for (const fn of m.afterCallbacks.splice(0)) await fn()
    expect(m.runWalkRoutesAfterChange).toHaveBeenCalledWith('philly')
  })

  it('works nothing out when there was nothing to restore', async () => {
    m.restoreResource.mockResolvedValue(null)
    expect((await restore()).status).toBe(404)
    expect(m.afterCallbacks).toHaveLength(0)
  })
})
