import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The community's own address (tracker 100): Resend's signed webhook, the
// community from the address, then an eruv, a watched newsletter, or a
// person's email passed to the admins.
const m = vi.hoisted(() => ({
  verify: vi.fn(),
  keys: [] as string[],
  get: vi.fn(),
  listAttachments: vi.fn(),
  listCommunities: vi.fn(),
  receiveEruvEmail: vi.fn(),
  receiveNewsletter: vi.fn(),
  sendForwardedEmail: vi.fn(),
  reportServerError: vi.fn(),
}))
vi.mock('resend', () => ({
  Resend: class {
    constructor(key: string) {
      m.keys.push(key)
    }
    webhooks = { verify: m.verify }
    emails = { receiving: { get: m.get, attachments: { list: m.listAttachments } } }
  },
}))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))
vi.mock('@/lib/eruvEmailRun', () => ({ receiveEruvEmail: m.receiveEruvEmail }))
vi.mock('@/lib/newsletterRun', () => ({ receiveNewsletter: m.receiveNewsletter }))
vi.mock('@/lib/email', () => ({ sendForwardedEmail: m.sendForwardedEmail }))
vi.mock('@/lib/serverError', () => ({ reportServerError: m.reportServerError }))

const { POST } = await import('./route')

const event = (over: Record<string, unknown> = {}) => ({
  type: 'email.received',
  created_at: '2026-11-27T15:00:00Z',
  data: { email_id: 'em_1', from: 'dana@gmail.com', to: ['philly@in.example.org'], cc: [], bcc: [], received_for: [], message_id: '<m1@gmail.com>', subject: 'Re: your listing', attachments: [], ...over },
})
const received = (over: Record<string, unknown> = {}) => ({
  object: 'email',
  id: 'em_1',
  to: ['philly@in.example.org'],
  from: 'dana@gmail.com',
  created_at: '2026-11-27T15:00:00Z',
  subject: 'Re: your listing',
  bcc: null,
  cc: null,
  reply_to: null,
  received_for: [],
  html: null,
  text: 'Thanks! One more thing: they close at 3 on Fridays.',
  headers: { From: 'Dana <dana@gmail.com>' },
  message_id: '<m1@gmail.com>',
  attachments: [],
  ...over,
})
const req = (headers: Record<string, string> = { 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,x' }) =>
  new Request('http://x/api/inbound/email', { method: 'POST', headers, body: JSON.stringify(event()) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('INBOUND_EMAIL_DOMAIN', 'in.example.org')
  vi.stubEnv('OPENAI_API_KEY', 'k')
  m.verify.mockReturnValue(event())
  m.get.mockResolvedValue({ data: received(), error: null })
  m.listCommunities.mockResolvedValue([{ slug: 'philly', name: 'Philadelphia', timezone: 'America/New_York' }])
  m.receiveEruvEmail.mockResolvedValue(null)
  m.receiveNewsletter.mockResolvedValue({ status: 'unknown' })
  m.sendForwardedEmail.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/inbound/email', () => {
  it('is closed until it’s set up', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    expect((await POST(req())).status).toBe(503)
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('INBOUND_EMAIL_DOMAIN', '')
    expect((await POST(req())).status).toBe(503)
    expect(m.verify).not.toHaveBeenCalled()
  })

  it('refuses what Resend didn’t sign, and checks the signature with its headers', async () => {
    m.verify.mockImplementation(() => {
      throw new Error('bad signature')
    })
    expect((await POST(req())).status).toBe(401)
    expect(m.verify).toHaveBeenCalledWith({ payload: JSON.stringify(event()), headers: { id: 'msg_1', timestamp: '1', signature: 'v1,x' }, webhookSecret: 'whsec_test' })
    expect(m.get).not.toHaveBeenCalled()
    expect(m.sendForwardedEmail).not.toHaveBeenCalled()
  })

  it('leaves mail to no community alone, and done with', async () => {
    m.verify.mockReturnValue(event({ to: ['sales@in.example.org'] }))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'no_community' })
    expect(m.get).not.toHaveBeenCalled()
  })

  it('reads an eruv’s email for its status, and nothing more', async () => {
    m.receiveEruvEmail.mockResolvedValue({ status: 'eruv', eruv: 'center-city', read: 'up' })
    const res = await POST(req())
    expect(await res.json()).toMatchObject({ status: 'eruv', read: 'up' })
    expect(m.receiveEruvEmail).toHaveBeenCalledWith('philly', expect.objectContaining({ from: 'Dana <dana@gmail.com>', messageId: '<m1@gmail.com>' }), { timezone: 'America/New_York' })
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
    expect(m.sendForwardedEmail).not.toHaveBeenCalled()
  })

  it('reads a watched newsletter, with its PDF, and doesn’t forward it', async () => {
    m.get.mockResolvedValue({ data: received({ attachments: [{ id: 'at_1', filename: 'times.pdf', size: 1000, content_type: 'application/pdf', content_id: null, content_disposition: 'attachment' }] }), error: null })
    m.listAttachments.mockResolvedValue({ data: { data: [{ id: 'at_1', download_url: 'https://files.example/at_1' }] } })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70])))
    m.receiveNewsletter.mockResolvedValue({ status: 'read', filed: 2 })
    try {
      const res = await POST(req())
      expect(await res.json()).toMatchObject({ status: 'read', filed: 2 })
      expect(m.receiveNewsletter).toHaveBeenCalledWith('philly', expect.objectContaining({ attachment: { mime: 'application/pdf', b64: 'JVBERg==' } }), expect.objectContaining({ apiKey: 'k' }))
      expect(m.sendForwardedEmail).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('passes a person’s email to the admins, replying to them', async () => {
    const res = await POST(req())
    expect(await res.json()).toMatchObject({ status: 'forwarded' })
    expect(m.sendForwardedEmail).toHaveBeenCalledWith('philly', {
      emailId: 'em_1',
      from: 'Dana <dana@gmail.com>',
      to: 'philly@in.example.org',
      subject: 'Re: your listing',
      date: '2026-11-27T15:00:00Z',
      text: 'Thanks! One more thing: they close at 3 on Fridays.',
      attachments: [],
    })
  })

  it('forwards no auto-reply or bounce, and nothing from a sender an admin ignores', async () => {
    m.get.mockResolvedValue({ data: received({ headers: { From: 'Dana <dana@gmail.com>', 'Auto-Submitted': 'auto-replied' } }), error: null })
    expect(await (await POST(req())).json()).toMatchObject({ status: 'automatic' })
    m.get.mockResolvedValue({ data: received(), error: null })
    m.receiveNewsletter.mockResolvedValue({ status: 'ignored' })
    expect(await (await POST(req())).json()).toMatchObject({ status: 'ignored' })
    expect(m.sendForwardedEmail).not.toHaveBeenCalled()
  })

  // Nov 27: the live sending key could only send, so every email stopped here.
  it('reads with its own key, and says when the key can only send', async () => {
    vi.stubEnv('RESEND_RECEIVING_API_KEY', 're_full')
    m.get.mockResolvedValue({ data: null, error: { name: 'restricted_api_key', message: 'This API key is restricted to only send emails' } })
    const res = await POST(req())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/RESEND_RECEIVING_API_KEY/)
    expect(m.keys.at(-1)).toBe('re_full')
  })

  it('asks Resend to send it again when forwarding fails', async () => {
    m.sendForwardedEmail.mockRejectedValue(new Error('Resend down'))
    expect((await POST(req())).status).toBe(500)
  })
})
