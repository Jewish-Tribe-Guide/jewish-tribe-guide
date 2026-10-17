import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAdminUserForCommunity: vi.fn(),
  resolveCommunity: vi.fn(),
  getCommunityAdminEmails: vi.fn(),
  addCommunityAdminEmail: vi.fn(),
  getAdminNotifyPreference: vi.fn(),
  getAdminReviewNotifyPreference: vi.fn(),
  setAdminNotifyPreference: vi.fn(),
  setAdminReviewNotifyPreference: vi.fn(),
}))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
  resolveCommunity: m.resolveCommunity,
  getCommunityAdminEmails: m.getCommunityAdminEmails,
  addCommunityAdminEmail: m.addCommunityAdminEmail,
  getAdminNotifyPreference: m.getAdminNotifyPreference,
  getAdminReviewNotifyPreference: m.getAdminReviewNotifyPreference,
  setAdminNotifyPreference: m.setAdminNotifyPreference,
  setAdminReviewNotifyPreference: m.setAdminReviewNotifyPreference,
}))

const { GET, PATCH, POST } = await import('./route')
const req = (method: string, body?: unknown, query = '') =>
  new Request(`http://x/api/admin/team${query}`, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.resolveCommunity.mockResolvedValue({ slug: 'ues' })
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
  m.getCommunityAdminEmails.mockResolvedValue(['me@x.co', 'other@x.co'])
  m.getAdminNotifyPreference.mockResolvedValue(true)
  m.getAdminReviewNotifyPreference.mockResolvedValue(false)
  m.addCommunityAdminEmail.mockResolvedValue(['me@x.co', 'new@x.co'])
})

describe.each([
  ['GET', () => GET(req('GET', undefined, '?community=ues'))],
  ['PATCH', () => PATCH(req('PATCH', { notify: true }, '?community=ues'))],
  ['POST', () => POST(req('POST', { email: 'a@b.co' }, '?community=ues'))],
])('%s /api/admin/team access', (_m, call) => {
  it('401s without an admin for THIS community, changing nothing', async () => {
    m.getAdminUserForCommunity.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    expect(m.getAdminUserForCommunity).toHaveBeenCalledWith(expect.anything(), 'ues')
    expect(m.setAdminNotifyPreference).not.toHaveBeenCalled()
    expect(m.addCommunityAdminEmail).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/team', () => {
  it('returns the team plus only the caller’s own preferences', async () => {
    const res = await GET(req('GET'))
    expect(await res.json()).toEqual({ ok: true, adminEmails: ['me@x.co', 'other@x.co'], myNotify: true, myReviewNotify: false })
    expect(m.getAdminNotifyPreference).toHaveBeenCalledWith('ues', 'me@x.co')
    expect(m.getAdminReviewNotifyPreference).toHaveBeenCalledWith('ues', 'me@x.co')
  })

  it('502s when loading fails', async () => {
    m.getCommunityAdminEmails.mockRejectedValue(new Error('db'))
    expect((await GET(req('GET'))).status).toBe(502)
  })
})

describe('PATCH /api/admin/team', () => {
  it('400s a body that is not JSON', async () => {
    expect((await PATCH(req('PATCH', '{'))).status).toBe(400)
  })

  it.each([{}, { notify: 'yes' }, { reviewNotify: 1 }, { notify: null }])('400s %j (needs a boolean)', async (body) => {
    expect((await PATCH(req('PATCH', body))).status).toBe(400)
    expect(m.setAdminNotifyPreference).not.toHaveBeenCalled()
    expect(m.setAdminReviewNotifyPreference).not.toHaveBeenCalled()
  })

  it('changes only the caller’s own preference, never an address from the body', async () => {
    await PATCH(req('PATCH', { notify: false, email: 'victim@x.co' }))
    expect(m.setAdminNotifyPreference).toHaveBeenCalledWith('ues', 'me@x.co', false)
    expect(JSON.stringify(m.setAdminNotifyPreference.mock.calls)).not.toContain('victim')
  })

  it('sets one preference without touching the other, and returns both', async () => {
    const res = await PATCH(req('PATCH', { reviewNotify: true }))
    expect(m.setAdminReviewNotifyPreference).toHaveBeenCalledWith('ues', 'me@x.co', true)
    expect(m.setAdminNotifyPreference).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ ok: true, myNotify: true, myReviewNotify: false })
  })

  it('a notify-only request leaves the review preference alone', async () => {
    await PATCH(req('PATCH', { notify: false }))
    expect(m.setAdminNotifyPreference).toHaveBeenCalledWith('ues', 'me@x.co', false)
    expect(m.setAdminReviewNotifyPreference).not.toHaveBeenCalled()
  })

  it('sets both when both are given', async () => {
    await PATCH(req('PATCH', { notify: true, reviewNotify: true }))
    expect(m.setAdminNotifyPreference).toHaveBeenCalled()
    expect(m.setAdminReviewNotifyPreference).toHaveBeenCalled()
  })

  it('502s when saving fails', async () => {
    m.setAdminNotifyPreference.mockRejectedValue(new Error('db'))
    expect((await PATCH(req('PATCH', { notify: true }))).status).toBe(502)
  })
})

describe('POST /api/admin/team', () => {
  it('400s a body that is not JSON', async () => {
    expect((await POST(req('POST', '{'))).status).toBe(400)
  })

  it.each([{}, { email: '' }, { email: '   ' }, { email: 'no-at-sign' }, { email: 42 }])('400s %j', async (body) => {
    expect((await POST(req('POST', body))).status).toBe(400)
    expect(m.addCommunityAdminEmail).not.toHaveBeenCalled()
  })

  it('adds the trimmed address to this community and returns the new list', async () => {
    const res = await POST(req('POST', { email: '  new@x.co ' }))
    expect(m.addCommunityAdminEmail).toHaveBeenCalledWith('ues', 'new@x.co')
    expect(await res.json()).toEqual({ ok: true, adminEmails: ['me@x.co', 'new@x.co'] })
  })

  it('502s with the store’s message when adding fails', async () => {
    m.addCommunityAdminEmail.mockRejectedValue(new Error('already on the list'))
    const res = await POST(req('POST', { email: 'a@b.co' }))
    expect(res.status).toBe(502)
    expect((await res.json()).errors).toEqual(['already on the list'])
  })
})
