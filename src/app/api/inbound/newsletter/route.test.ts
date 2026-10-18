import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The door the guide's Gmail script knocks on: its own secret, a real
// community, and what became of the email in the answer.
const m = vi.hoisted(() => ({ receiveNewsletter: vi.fn(), listCommunities: vi.fn() }))
vi.mock('@/lib/newsletterRun', () => ({ receiveNewsletter: m.receiveNewsletter }))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))

const { POST } = await import('./route')
const SECRET = 'a-long-test-secret'
const email = { community: 'philly', messageId: 'g1', from: 'Mekor <info@mekor.org>', subject: 'Shabbos', date: '2026-10-16T14:00:00Z', text: 'Mincha 6pm' }
const req = (body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  new Request('http://x/api/inbound/newsletter', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEWSLETTER_SECRET', SECRET)
  vi.stubEnv('OPENAI_API_KEY', 'k')
  m.listCommunities.mockResolvedValue([{ slug: 'philly', name: 'Philadelphia' }])
  m.receiveNewsletter.mockResolvedValue({ status: 'read', filed: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/inbound/newsletter', () => {
  it('is closed when no secret is set, and to anyone without it', async () => {
    vi.stubEnv('NEWSLETTER_SECRET', '')
    expect((await POST(req(email))).status).toBe(503)
    vi.stubEnv('NEWSLETTER_SECRET', SECRET)
    expect((await POST(req(email, null))).status).toBe(401)
    expect((await POST(req(email, 'Bearer wrong'))).status).toBe(401)
    expect((await POST(req(email, `Bearer ${SECRET}x`))).status).toBe(401)
    // The same length, one letter off.
    expect((await POST(req(email, `Bearer ${SECRET.slice(0, -1)}X`))).status).toBe(401)
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
  })

  it('hands a real community’s email to the reader and says what became of it', async () => {
    const res = await POST(req({ ...email, attachment: { mime: 'application/pdf', b64: 'JVBERg==' } }))
    expect(await res.json()).toEqual({ ok: true, status: 'read', filed: 1 })
    expect(m.receiveNewsletter).toHaveBeenCalledWith(
      'philly',
      { messageId: 'g1', from: email.from, subject: 'Shabbos', date: '2026-10-16T14:00:00.000Z', text: 'Mincha 6pm', attachment: { mime: 'application/pdf', b64: 'JVBERg==' } },
      { apiKey: 'k', communityName: 'Philadelphia' },
    )
  })

  it('refuses an unknown community or an email missing its id or sender', async () => {
    expect((await POST(req({ ...email, community: 'nowhere' }))).status).toBe(400)
    expect((await POST(req({ ...email, messageId: '' }))).status).toBe(400)
    expect((await POST(req({ ...email, from: undefined }))).status).toBe(400)
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
  })

  it('answers a failed read with an error, so the script sends the email again', async () => {
    m.receiveNewsletter.mockRejectedValue(new Error('Message reader: 500'))
    const res = await POST(req(email))
    expect(res.status).toBe(502)
    expect((await res.json()).ok).toBe(false)
  })
})
