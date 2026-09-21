import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUser: vi.fn(),
  addCommunityAdminEmail: vi.fn(),
  deleteCommunity: vi.fn(),
  getCommunityAdminEmails: vi.fn(),
  getCommunityNotifyPreferenceLists: vi.fn(),
  getCommunityPreviewToken: vi.fn(),
  removeCommunityAdminEmail: vi.fn(),
  setCommunityEmailLists: vi.fn(),
  setCommunityVisibility: vi.fn(),
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUser: m.getAdminUser }))
vi.mock('@/lib/communityStore', () => ({
  addCommunityAdminEmail: m.addCommunityAdminEmail,
  deleteCommunity: m.deleteCommunity,
  getCommunityAdminEmails: m.getCommunityAdminEmails,
  getCommunityNotifyPreferenceLists: m.getCommunityNotifyPreferenceLists,
  getCommunityPreviewToken: m.getCommunityPreviewToken,
  removeCommunityAdminEmail: m.removeCommunityAdminEmail,
  setCommunityEmailLists: m.setCommunityEmailLists,
  setCommunityVisibility: m.setCommunityVisibility,
}))

const { PATCH, DELETE } = await import('./route')
const ctx = { params: Promise.resolve({ slug: 'ues' }) } as never
const patch = (body: unknown) =>
  PATCH(new Request('http://x/api/admin/communities/ues', { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never, ctx)
const del = (body: unknown) =>
  DELETE(new Request('http://x/api/admin/communities/ues', { method: 'DELETE', body: typeof body === 'string' ? body : JSON.stringify(body) }) as never, ctx)

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.getAdminUser.mockResolvedValue({ email: 'super@x.co' })
  m.setCommunityVisibility.mockResolvedValue({ community: { slug: 'ues', visible: true }, previewToken: 'tok-new' })
  m.setCommunityEmailLists.mockResolvedValue({ slug: 'ues' })
  m.getCommunityAdminEmails.mockResolvedValue(['a@x.co'])
  m.getCommunityNotifyPreferenceLists.mockResolvedValue({ notifyMutedEmails: ['m@x.co'], notifyReviewEmails: ['r@x.co'] })
  m.getCommunityPreviewToken.mockResolvedValue('tok-existing')
  m.revalidatePublicContent.mockResolvedValue(undefined)
  m.deleteCommunity.mockResolvedValue(undefined)
})

describe('PATCH /api/admin/communities/:slug', () => {
  it('401s a non-superadmin and changes nothing', async () => {
    m.getAdminUser.mockResolvedValue(null)
    expect((await patch({ visible: true })).status).toBe(401)
    expect(m.setCommunityVisibility).not.toHaveBeenCalled()
  })

  it('400s a body that is not JSON', async () => {
    expect((await patch('{')).status).toBe(400)
  })

  it.each([
    ['visible that is not a boolean', { visible: 'yes' }],
    ['a blank addAdminEmail', { addAdminEmail: '  ' }],
    ['a non-string addAdminEmail', { addAdminEmail: 5 }],
    ['a blank removeAdminEmail', { removeAdminEmail: '' }],
    ['nothing at all', {}],
    ['adminEmails that is not an array', { adminEmails: 'a@x.co' }],
  ])('400s %s, writing nothing', async (_n, body) => {
    expect((await patch(body)).status).toBe(400)
    expect(m.setCommunityVisibility).not.toHaveBeenCalled()
    expect(m.setCommunityEmailLists).not.toHaveBeenCalled()
    expect(m.addCommunityAdminEmail).not.toHaveBeenCalled()
    expect(m.removeCommunityAdminEmail).not.toHaveBeenCalled()
  })

  it('publishes, returns the fresh token it just issued, and refreshes the public cache', async () => {
    const res = await patch({ visible: true })
    expect(m.setCommunityVisibility).toHaveBeenCalledWith('ues', true)
    expect(m.getCommunityPreviewToken).not.toHaveBeenCalled()
    expect(m.revalidatePublicContent).toHaveBeenCalled()
    expect(await res.json()).toEqual({
      ok: true,
      community: {
        slug: 'ues',
        visible: true,
        adminEmails: ['a@x.co'],
        notifyMutedEmails: ['m@x.co'],
        notifyReviewEmails: ['r@x.co'],
        previewToken: 'tok-new',
      },
    })
  })

  it('unpublishing is allowed too (visible: false is a real value, not "absent")', async () => {
    await patch({ visible: false })
    expect(m.setCommunityVisibility).toHaveBeenCalledWith('ues', false)
  })

  it('re-reads the existing preview token when visibility was not touched', async () => {
    const res = await patch({ addAdminEmail: 'new@x.co' })
    expect(m.setCommunityVisibility).not.toHaveBeenCalled()
    expect(m.getCommunityPreviewToken).toHaveBeenCalledWith('ues')
    expect((await res.json()).community.previewToken).toBe('tok-existing')
  })

  it('replaces the admin list wholesale, keeping only non-blank strings, trimmed', async () => {
    await patch({ adminEmails: [' a@x.co ', '', '  ', 7, 'b@x.co'] })
    expect(m.setCommunityEmailLists).toHaveBeenCalledWith('ues', { adminEmails: ['a@x.co', 'b@x.co'] })
  })

  it('an empty adminEmails list is a real update (clearing), not "nothing to update"', async () => {
    expect((await patch({ adminEmails: [] })).status).toBe(200)
    expect(m.setCommunityEmailLists).toHaveBeenCalledWith('ues', { adminEmails: [] })
  })

  it('adds and removes a single admin address', async () => {
    await patch({ addAdminEmail: 'new@x.co', removeAdminEmail: 'old@x.co' })
    expect(m.addCommunityAdminEmail).toHaveBeenCalledWith('ues', 'new@x.co')
    expect(m.removeCommunityAdminEmail).toHaveBeenCalledWith('ues', 'old@x.co')
  })

  it('502s with the store’s message, and does not refresh the cache, when saving fails', async () => {
    m.setCommunityVisibility.mockRejectedValue(new Error('slug not found'))
    const res = await patch({ visible: true })
    expect(res.status).toBe(502)
    expect((await res.json()).errors).toEqual(['slug not found'])
    expect(m.revalidatePublicContent).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/communities/:slug', () => {
  it('401s a non-superadmin and deletes nothing', async () => {
    m.getAdminUser.mockResolvedValue(null)
    expect((await del({ confirmSlug: 'ues' })).status).toBe(401)
    expect(m.deleteCommunity).not.toHaveBeenCalled()
  })

  it('is refused outright on the real production deployment, even for a superadmin who confirms correctly', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await del({ confirmSlug: 'ues' })).status).toBe(403)
    expect(m.deleteCommunity).not.toHaveBeenCalled()
  })

  it('is allowed on a preview deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await del({ confirmSlug: 'ues' })).status).toBe(200)
  })

  it('400s a body that is not JSON', async () => {
    expect((await del('{')).status).toBe(400)
    expect(m.deleteCommunity).not.toHaveBeenCalled()
  })

  it.each([{}, { confirmSlug: 'philly' }, { confirmSlug: 'UES' }, { confirmSlug: ' ues' }, { confirmSlug: null }])(
    '400s a confirmation of %j that does not exactly match the URL’s slug',
    async (body) => {
      expect((await del(body)).status).toBe(400)
      expect(m.deleteCommunity).not.toHaveBeenCalled()
    },
  )

  it('deletes the confirmed community and refreshes the public cache', async () => {
    const res = await del({ confirmSlug: 'ues' })
    expect(await res.json()).toEqual({ ok: true })
    expect(m.deleteCommunity).toHaveBeenCalledWith('ues')
    expect(m.revalidatePublicContent).toHaveBeenCalled()
  })

  it('502s with the store’s message when deleting fails', async () => {
    m.deleteCommunity.mockRejectedValue(new Error('has dependents'))
    const res = await del({ confirmSlug: 'ues' })
    expect(res.status).toBe(502)
    expect((await res.json()).errors).toEqual(['has dependents'])
  })
})
