import { beforeEach, describe, expect, it, vi } from 'vitest'

// Posts the AI's read couldn't file whole, for an admin (Nov 27); loading
// them is also the retry for a read that never finished.
const m = vi.hoisted(() => ({
  admin: vi.fn(),
  left: vi.fn(),
  unread: vi.fn(),
  done: vi.fn(),
  readAndFile: vi.fn(),
  doneEmail: vi.fn(),
  afterCallbacks: [] as (() => unknown)[],
}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => m.afterCallbacks.push(fn) }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.admin }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/serverError', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/sentMessageStore', () => ({ listLeftForAdmin: m.left, listUnread: m.unread, markDone: m.done }))
vi.mock('@/lib/messageFiling', () => ({ readAndFile: m.readAndFile, MAX_ATTEMPTS: 3 }))
vi.mock('@/lib/confirmationEmail', () => ({ sendPostDoneEmail: m.doneEmail }))

const { GET, POST } = await import('./route')
const ID = '00000000-aaaa-4aaa-8aaa-000000000001'
const req = (method: string, body?: unknown) => new Request('http://x/api/admin/sent-posts?community=philly', { method, body: body === undefined ? undefined : JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  process.env.OPENAI_API_KEY = 'k'
  m.admin.mockResolvedValue({ email: 'me@x.co' })
  m.left.mockResolvedValue([{ id: ID, text: 'TJ has challah', photoUrls: [], left: ['Which place? Arch St or Market St: “TJ”'], createdAt: '2026-11-27T12:00:00Z', email: 'them@x.co', status: 'left' }])
  m.unread.mockResolvedValue([{ id: 'stuck', attempts: 1 }])
})

describe('/api/admin/sent-posts', () => {
  it('lists what was left, as sent, without the sender’s email; then tries stuck reads again', async () => {
    const body = await (await GET(req('GET'))).json()
    expect(body.posts).toEqual([{ id: ID, text: 'TJ has challah', photoUrls: [], left: ['Which place? Arch St or Market St: “TJ”'], createdAt: '2026-11-27T12:00:00Z' }])
    expect(m.readAndFile).not.toHaveBeenCalled()
    await m.afterCallbacks[0]()
    expect(m.unread).toHaveBeenCalledWith('philly', 10 * 60 * 1000, 3)
    expect(m.readAndFile).toHaveBeenCalledWith({ slug: 'philly' }, { id: 'stuck', attempts: 1 }, { apiKey: 'k' })
  })

  it('marks one done', async () => {
    m.done.mockResolvedValue({ id: ID, community: 'philly', text: 'TJ has challah', email: null })
    expect(await (await POST(req('POST', { id: ID }))).json()).toEqual({ ok: true, done: true })
    expect(m.done).toHaveBeenCalledWith('philly', ID)
    expect(m.afterCallbacks).toHaveLength(0)
    expect((await POST(req('POST', { id: 'nope' }))).status).toBe(400)
    m.done.mockResolvedValue(null)
    expect(await (await POST(req('POST', { id: ID }))).json()).toEqual({ ok: true, done: false })
  })

  // Tracker 103: "Email me when it's on the site" on a post left for an
  // admin was kept, and Done emailed no one.
  it('emails the visitor who asked, once it’s done', async () => {
    const post = { id: ID, community: 'philly', text: 'TJ has challah', email: 'them@x.co' }
    m.done.mockResolvedValue(post)
    m.doneEmail.mockRejectedValue(new Error('Resend down'))
    expect(await (await POST(req('POST', { id: ID }))).json()).toEqual({ ok: true, done: true })
    expect(m.doneEmail).not.toHaveBeenCalled()
    await m.afterCallbacks[0]()
    expect(m.doneEmail).toHaveBeenCalledWith(post)
  })

  it('is for admins only', async () => {
    m.admin.mockResolvedValue(null)
    expect((await GET(req('GET'))).status).toBe(401)
    expect((await POST(req('POST', { id: ID }))).status).toBe(401)
    expect(m.done).not.toHaveBeenCalled()
  })
})
