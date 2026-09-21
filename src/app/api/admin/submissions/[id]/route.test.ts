import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUserForCommunity: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  sendDecisionEmail: vi.fn(),
  sendReviewActionNotification: vi.fn(),
  sendStatusChangeDigest: vi.fn(),
  loadSyncableListing: vi.fn(),
  syncOneListing: vi.fn(),
  resolveCommunity: vi.fn(),
  getResourceRowById: vi.fn(),
  getCategoryById: vi.fn(),
  listSubscribersForCategory: vi.fn(),
  sendNewListingNotification: vi.fn(),
  sendClosureNotification: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void m.afterCallbacks.push(fn) }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/submissionStore', () => ({ approveSubmission: m.approveSubmission, rejectSubmission: m.rejectSubmission }))
vi.mock('@/lib/confirmationEmail', () => ({ sendDecisionEmail: m.sendDecisionEmail }))
vi.mock('@/lib/email', () => ({
  sendReviewActionNotification: m.sendReviewActionNotification,
  sendStatusChangeDigest: m.sendStatusChangeDigest,
}))
vi.mock('@/lib/syncListing', () => ({ loadSyncableListing: m.loadSyncableListing, syncOneListing: m.syncOneListing }))
vi.mock('@/lib/communityStore', () => ({
  resolveCommunity: m.resolveCommunity,
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
}))
vi.mock('@/lib/resourceStore', () => ({ getResourceRowById: m.getResourceRowById }))
vi.mock('@/lib/categoryStore', () => ({ getCategoryById: m.getCategoryById }))
vi.mock('@/lib/subscriberStore', () => ({ listSubscribersForCategory: m.listSubscribersForCategory }))
vi.mock('@/lib/subscriberEmail', () => ({
  sendNewListingNotification: m.sendNewListingNotification,
  sendClosureNotification: m.sendClosureNotification,
}))
vi.mock('@/lib/siteUrl', () => ({ siteUrl: () => 'https://site.test' }))

const { PATCH } = await import('./route')
const ctx = { params: Promise.resolve({ id: 'sub1' }) } as never
const patch = (body: unknown, query = '') =>
  PATCH(new Request(`http://x/api/admin/submissions/sub1${query}`, { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never, ctx)
const runAfter = async () => {
  for (const fn of m.afterCallbacks.splice(0)) await fn()
}

const submission = (operation: string, extra = {}) => ({ id: 'sub1', operation, target_id: 'res1', ...extra })
const resource = { id: 'res1', name: 'Kosher Deli', category: 'restaurant' }

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'ues' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'admin@x.co' })
  m.approveSubmission.mockResolvedValue(submission('create'))
  m.rejectSubmission.mockResolvedValue(submission('create'))
  m.sendDecisionEmail.mockResolvedValue(undefined)
  m.sendReviewActionNotification.mockResolvedValue(undefined)
  m.sendStatusChangeDigest.mockResolvedValue(undefined)
  m.loadSyncableListing.mockResolvedValue(null)
  m.getResourceRowById.mockResolvedValue(resource)
  m.getCategoryById.mockResolvedValue({ pluralLabel: 'Restaurants' })
  m.listSubscribersForCategory.mockResolvedValue([{ email: 's@x.co' }])
  m.revalidatePublicContent.mockResolvedValue(undefined)
})

describe('PATCH /api/admin/submissions/:id — access and input', () => {
  it('401s without an admin for THIS community, doing nothing', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await patch({ status: 'approved' }, '?community=ues')).status).toBe(401)
    expect(m.resolveCommunity).toHaveBeenCalledWith('ues')
    expect(m.getAdminUserForCommunity).toHaveBeenCalledWith(expect.anything(), 'ues')
    expect(m.approveSubmission).not.toHaveBeenCalled()
    expect(m.rejectSubmission).not.toHaveBeenCalled()
  })

  it('400s a body that is not JSON', async () => {
    expect((await patch('{')).status).toBe(400)
  })

  it.each(['pending', 'APPROVED', '', undefined, 5])('400s the status %j', async (status) => {
    expect((await patch({ status })).status).toBe(400)
    expect(m.approveSubmission).not.toHaveBeenCalled()
    expect(m.rejectSubmission).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/submissions/:id — the decision', () => {
  it('approves within the community, as the signed-in admin', async () => {
    const res = await patch({ status: 'approved' })
    expect(res.status).toBe(200)
    expect((await res.json()).submission.id).toBe('sub1')
    expect(m.approveSubmission).toHaveBeenCalledWith('sub1', 'ues', 'admin@x.co')
    expect(m.rejectSubmission).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('rejects within the community, as the signed-in admin', async () => {
    await patch({ status: 'rejected' })
    expect(m.rejectSubmission).toHaveBeenCalledWith('sub1', 'ues', 'admin@x.co')
    expect(m.approveSubmission).not.toHaveBeenCalled()
  })

  it('502s, with no emails and no cache refresh, when the store fails', async () => {
    m.approveSubmission.mockRejectedValue(new Error('db down'))
    expect((await patch({ status: 'approved' })).status).toBe(502)
    expect(m.afterCallbacks).toHaveLength(0)
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })

  it('emails the submitter (with the trimmed reason) and notifies the other admins, after the response', async () => {
    await patch({ status: 'rejected', reason: '  duplicate  ' })
    expect(m.sendDecisionEmail).not.toHaveBeenCalled() // not before the response
    await runAfter()
    expect(m.sendDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub1' }), 'rejected', 'duplicate')
    expect(m.sendReviewActionNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub1' }), 'rejected', 'admin@x.co')
  })

  it('treats a blank reason as none', async () => {
    await patch({ status: 'rejected', reason: '   ' })
    await runAfter()
    expect(m.sendDecisionEmail).toHaveBeenCalledWith(expect.anything(), 'rejected', undefined)
  })

  it('a failing decision email neither fails the moderation nor blocks the other notification', async () => {
    m.sendDecisionEmail.mockRejectedValue(new Error('resend down'))
    expect((await patch({ status: 'rejected' })).status).toBe(200)
    await expect(runAfter()).resolves.toBeUndefined()
    expect(m.sendReviewActionNotification).toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/submissions/:id — subscriber notifications', () => {
  it('tells subscribers about an approved new listing, linking to it', async () => {
    await patch({ status: 'approved' })
    await runAfter()
    expect(m.listSubscribersForCategory).toHaveBeenCalledWith('ues', 'restaurant', 'add')
    const [subs, listing, label] = m.sendNewListingNotification.mock.calls[0]
    expect(subs).toEqual([{ email: 's@x.co' }])
    expect(listing.name).toBe('Kosher Deli')
    expect(listing.url).toMatch(/^https:\/\/site\.test\/.*res1/)
    expect(label).toBe('Restaurants')
  })

  it('tells subscribers about an approved closure', async () => {
    m.approveSubmission.mockResolvedValue(submission('delete'))
    await patch({ status: 'approved' })
    await runAfter()
    expect(m.listSubscribersForCategory).toHaveBeenCalledWith('ues', 'restaurant', 'closure')
    expect(m.sendClosureNotification).toHaveBeenCalledWith([{ email: 's@x.co' }], { name: 'Kosher Deli' }, 'Restaurants')
    expect(m.sendNewListingNotification).not.toHaveBeenCalled()
  })

  it.each([
    ['an approved edit', 'approved', 'update'],
    ['a rejected new listing', 'rejected', 'create'],
    ['a rejected closure', 'rejected', 'delete'],
  ])('sends subscribers nothing for %s', async (_n, status, operation) => {
    m.approveSubmission.mockResolvedValue(submission(operation))
    m.rejectSubmission.mockResolvedValue(submission(operation))
    await patch({ status })
    await runAfter()
    expect(m.listSubscribersForCategory).not.toHaveBeenCalled()
    expect(m.sendNewListingNotification).not.toHaveBeenCalled()
    expect(m.sendClosureNotification).not.toHaveBeenCalled()
  })

  it('sends nothing when nobody subscribed, or the listing or category is gone', async () => {
    m.listSubscribersForCategory.mockResolvedValue([])
    await patch({ status: 'approved' }); await runAfter()
    m.listSubscribersForCategory.mockResolvedValue([{ email: 's@x.co' }])
    m.getResourceRowById.mockResolvedValue(null)
    await patch({ status: 'approved' }); await runAfter()
    m.getResourceRowById.mockResolvedValue(resource)
    m.getCategoryById.mockResolvedValue(null)
    await patch({ status: 'approved' }); await runAfter()
    expect(m.sendNewListingNotification).not.toHaveBeenCalled()
  })

  it('a failing subscriber lookup cannot fail the approval', async () => {
    m.listSubscribersForCategory.mockRejectedValue(new Error('db'))
    expect((await patch({ status: 'approved' })).status).toBe(200)
    await expect(runAfter()).resolves.toBeUndefined()
  })
})

describe('PATCH /api/admin/submissions/:id — Google sync after approval', () => {
  const unsynced = { details: {} }

  it('syncs a listing that has never been synced', async () => {
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockResolvedValue({ outcome: 'synced' })
    await patch({ status: 'approved' })
    expect(m.loadSyncableListing).toHaveBeenCalledWith('res1')
    expect(m.syncOneListing).toHaveBeenCalledWith(unsynced)
  })

  it('spends no Google call on a listing that already has googleSyncedAt', async () => {
    m.loadSyncableListing.mockResolvedValue({ details: { googleSyncedAt: '2026-01-01' } })
    await patch({ status: 'approved' })
    expect(m.syncOneListing).not.toHaveBeenCalled()
  })

  it('never syncs an approved removal (it would ask Google about a place just taken down)', async () => {
    m.approveSubmission.mockResolvedValue(submission('delete'))
    await patch({ status: 'approved' })
    expect(m.loadSyncableListing).not.toHaveBeenCalled()
  })

  it('never syncs a rejection', async () => {
    await patch({ status: 'rejected' })
    expect(m.loadSyncableListing).not.toHaveBeenCalled()
  })

  it('sends the status digest when the sync discovered a change', async () => {
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockResolvedValue({ outcome: 'synced', statusChange: { name: 'Kosher Deli' } })
    await patch({ status: 'approved' })
    expect(m.sendStatusChangeDigest).toHaveBeenCalledWith([{ name: 'Kosher Deli' }])
  })

  it('sends no digest when the sync found nothing, or did not sync', async () => {
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockResolvedValue({ outcome: 'synced' })
    await patch({ status: 'approved' })
    m.syncOneListing.mockResolvedValue({ outcome: 'skipped', statusChange: { name: 'x' } })
    await patch({ status: 'approved' })
    expect(m.sendStatusChangeDigest).not.toHaveBeenCalled()
  })

  it('a sync that throws is not reported as a failed approval, and the cache still refreshes', async () => {
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockRejectedValue(new Error('google unreachable'))
    const res = await patch({ status: 'approved' })
    expect(res.status).toBe(200)
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('a failing digest email does not fail the approval either', async () => {
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockResolvedValue({ outcome: 'synced', statusChange: { name: 'x' } })
    m.sendStatusChangeDigest.mockRejectedValue(new Error('resend'))
    expect((await patch({ status: 'approved' })).status).toBe(200)
  })

  it('syncs before publishing, so the cache refresh includes the synced values', async () => {
    const order: string[] = []
    m.loadSyncableListing.mockResolvedValue(unsynced)
    m.syncOneListing.mockImplementation(async () => { order.push('sync'); return { outcome: 'synced' } })
    m.revalidatePublicContent.mockImplementation(async () => { order.push('revalidate') })
    await patch({ status: 'approved' })
    expect(order).toEqual(['sync', 'revalidate'])
  })
})
