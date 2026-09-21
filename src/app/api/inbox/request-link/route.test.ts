import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  isAllowedInboxEmail: vi.fn(),
  sendInboxMagicLink: vi.fn(),
  createUser: vi.fn(),
  generateLink: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/inboxAuth', () => ({ isAllowedInboxEmail: m.isAllowedInboxEmail }))
vi.mock('@/lib/email', () => ({ sendInboxMagicLink: m.sendInboxMagicLink }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ auth: { admin: { createUser: m.createUser, generateLink: m.generateLink } } }),
}))

const { POST } = await import('./route')
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://site.test/api/inbox/request-link', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.enforceRateLimit.mockResolvedValue(null)
  m.isAllowedInboxEmail.mockReturnValue(true)
  m.createUser.mockResolvedValue({ error: null })
  m.generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://link' } }, error: null })
  m.sendInboxMagicLink.mockResolvedValue(undefined)
})

describe('POST /api/inbox/request-link', () => {
  it('returns the rate limiter’s response', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post({ email: 'a@b.co' })).status).toBe(429)
    expect(m.createUser).not.toHaveBeenCalled()
  })

  it('400s a body that is not JSON, and an empty email', async () => {
    expect((await post('{')).status).toBe(400)
    expect((await post({ email: '   ' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })

  it('gives a non-allowlisted address the SAME answer as an allowlisted one, and sends nothing', async () => {
    m.isAllowedInboxEmail.mockReturnValue(false)
    const denied = await post({ email: 'stranger@x.co' })
    m.isAllowedInboxEmail.mockReturnValue(true)
    const allowed = await post({ email: 'viewer@x.co' })
    expect(denied.status).toBe(200)
    expect(await denied.json()).toEqual(await allowed.json())
    expect(m.createUser).toHaveBeenCalledTimes(1)
    expect(m.sendInboxMagicLink).toHaveBeenCalledTimes(1)
  })

  it('creates the viewer, links back to /inbox on the request origin, and emails the link', async () => {
    const res = await post({ email: ' Viewer@X.co ' }, { origin: 'https://philly.example' })
    expect(await res.json()).toEqual({ ok: true })
    expect(m.createUser).toHaveBeenCalledWith({ email: 'Viewer@X.co', email_confirm: true })
    expect(m.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'Viewer@X.co',
      options: { redirectTo: 'https://philly.example/inbox' },
    })
    expect(m.sendInboxMagicLink).toHaveBeenCalledWith('Viewer@X.co', 'https://link')
  })

  it('falls back to the request URL’s origin when there is no Origin header', async () => {
    await post({ email: 'viewer@x.co' })
    expect(m.generateLink.mock.calls[0][0].options.redirectTo).toBe('http://site.test/inbox')
  })

  it('carries on when the user already exists, but 502s on any other create error', async () => {
    m.createUser.mockResolvedValue({ error: { message: 'A user with this email address has already been registered' } })
    expect((await post({ email: 'viewer@x.co' })).status).toBe(200)
    m.createUser.mockResolvedValue({ error: { message: 'database exploded' } })
    expect((await post({ email: 'viewer@x.co' })).status).toBe(502)
  })

  it.each([
    ['link generation errors', { data: null, error: { message: 'x' } }],
    ['no link comes back', { data: { properties: {} }, error: null }],
  ])('502s, sending nothing, when %s', async (_n, result) => {
    m.generateLink.mockResolvedValue(result)
    expect((await post({ email: 'viewer@x.co' })).status).toBe(502)
    expect(m.sendInboxMagicLink).not.toHaveBeenCalled()
  })

  it('502s when the email cannot be sent', async () => {
    m.sendInboxMagicLink.mockRejectedValue(new Error('resend down'))
    expect((await post({ email: 'viewer@x.co' })).status).toBe(502)
  })
})
