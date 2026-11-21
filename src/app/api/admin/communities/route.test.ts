import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  revalidatePublicContent: vi.fn(),
  getAdminUser: vi.fn(),
  createCommunity: vi.fn(),
  removeUnfinishedCommunity: vi.fn(),
  cloneCommunityContent: vi.fn(),
  addMissingSiteScreens: vi.fn(),
  reportServerError: vi.fn(),
}))
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: m.revalidatePublicContent }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUser: m.getAdminUser, getAllowedAdminEmails: () => ['super@x.co'] }))
vi.mock('@/lib/serverError', () => ({ reportServerError: m.reportServerError }))
vi.mock('@/lib/communityStore', () => ({
  createCommunity: m.createCommunity,
  removeUnfinishedCommunity: m.removeUnfinishedCommunity,
  listCommunities: vi.fn(),
  listCommunityAdminEmails: vi.fn(),
  listCommunityNotifyPreferenceLists: vi.fn(),
  listCommunityPreviewTokens: vi.fn(),
}))
vi.mock('@/lib/communityCloning', () => ({ cloneCommunityContent: m.cloneCommunityContent, addMissingSiteScreens: m.addMissingSiteScreens }))

const { POST } = await import('./route')
const body = { slug: 'ues', name: 'UES', mission: 'm', region: 'r', timezone: 'America/New_York', mapCenter: { lat: 40, lng: -74 }, themeColor: '#000000', backgroundColor: '#ffffff' }
const post = (over: object = {}) => POST(new Request('http://x/api/admin/communities', { method: 'POST', body: JSON.stringify({ ...body, ...over }) }) as never, undefined as never)

beforeEach(() => {
  vi.resetAllMocks()
  m.getAdminUser.mockResolvedValue({ email: 'super@x.co' })
  m.createCommunity.mockResolvedValue({ slug: 'ues' })
})

// Nov 21, the save survey: a community whose content was copied in part
// stayed, and making it again was "already in use".
describe('POST /api/admin/communities: one made only in part', () => {
  it('makes it, copies the content, and adds the screens', async () => {
    expect((await post({ cloneFrom: 'philly' })).status).toBe(200)
    expect(m.cloneCommunityContent).toHaveBeenCalledWith('ues', 'philly')
    expect(m.addMissingSiteScreens).toHaveBeenCalledWith('ues')
    expect(m.removeUnfinishedCommunity).not.toHaveBeenCalled()
  })

  it('a copy that fails takes the new community back out', async () => {
    m.cloneCommunityContent.mockRejectedValue(new Error('timeout'))
    expect((await post({ cloneFrom: 'philly' })).status).toBe(502)
    expect(m.removeUnfinishedCommunity).toHaveBeenCalledWith('ues')
  })

  it('screens that fail take it back out too', async () => {
    m.addMissingSiteScreens.mockRejectedValue(new Error('timeout'))
    expect((await post()).status).toBe(502)
    expect(m.removeUnfinishedCommunity).toHaveBeenCalledWith('ues')
  })

  it('a take-back that fails too is said', async () => {
    m.addMissingSiteScreens.mockRejectedValue(new Error('timeout'))
    m.removeUnfinishedCommunity.mockRejectedValue(new Error('also down'))
    const res = await post()
    expect(res.status).toBe(502)
    expect(m.reportServerError).toHaveBeenCalledWith(expect.stringContaining('made only in part'), expect.any(Error))
  })
})
