import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  pending: vi.fn(),
  approve: vi.fn(),
  revalidate: vi.fn(),
  site: vi.fn(),
  load: vi.fn(),
  sync: vi.fn(),
  digest: vi.fn(async () => {}),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.admin }))
vi.mock('@/lib/communityStore', () => ({ resolveCommunity: async () => ({ slug: 'philly' }), communitySlugFromRequest: () => 'philly' }))
vi.mock('@/lib/hoursJobRun', () => ({ readOwnSiteNow: m.site }))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidate }))
vi.mock('@/lib/submissionStore', () => ({ pendingForListing: m.pending, approveSubmission: m.approve }))
vi.mock('@/lib/email', () => ({ sendStatusChangeDigest: m.digest }))
vi.mock('@/lib/syncListing', () => ({ loadSyncableListing: m.load, syncOneListing: m.sync }))

import { GET, POST } from './route'

const ctx = { params: Promise.resolve({ id: 'L1' }) } as never
const post = (action: string) => POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify({ action }) }) as never, ctx)

beforeEach(() => {
  vi.clearAllMocks()
  m.admin.mockResolvedValue({ email: 'a@b.org' })
  m.pending.mockResolvedValue([{ id: 's1', payload: {} }, { id: 's2', payload: {} }])
})

describe('/api/admin/listings/:id/found', () => {
  it('refuses anyone who isn’t an admin, and changes nothing', async () => {
    m.admin.mockResolvedValue(null)
    expect((await GET(new Request('http://x/api') as never, ctx)).status).toBe(401)
    expect((await post('take')).status).toBe(401)
    expect(m.approve).not.toHaveBeenCalled()
  })

  it('take approves each waiting, oldest first, then drops the cache', async () => {
    const res = await post('take')
    expect(await res.json()).toEqual({ ok: true, taken: 2 })
    expect(m.approve.mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    expect(m.approve).toHaveBeenCalledWith('s1', 'philly', 'a@b.org')
    expect(m.revalidate).toHaveBeenCalledOnce()
  })

  it('google reads a place with a place id, and quietly passes one without', async () => {
    m.load.mockResolvedValueOnce(null)
    expect(await (await post('google')).json()).toEqual({ ok: true, read: false })
    expect(m.sync).not.toHaveBeenCalled()
    m.load.mockResolvedValueOnce({ id: 'L1' })
    m.sync.mockResolvedValueOnce({ outcome: 'synced' })
    expect(await (await post('google')).json()).toEqual({ ok: true, read: true })
    expect(m.revalidate).toHaveBeenCalledOnce()
  })

  it('anything else is refused', async () => {
    expect((await post('nope')).status).toBe(400)
  })
})
