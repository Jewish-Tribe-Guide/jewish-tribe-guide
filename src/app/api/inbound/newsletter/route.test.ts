import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The door the guide's Gmail script knocks on: its own secret, a real
// community, and what became of the email in the answer.
const m = vi.hoisted(() => ({ receiveNewsletter: vi.fn(), newsletterSenders: vi.fn(), listCommunities: vi.fn(), receiveEruvEmail: vi.fn() }))
vi.mock('@/lib/eruvEmailRun', () => ({ receiveEruvEmail: m.receiveEruvEmail }))
vi.mock('@/lib/newsletterRun', () => ({ receiveNewsletter: m.receiveNewsletter, newsletterSenders: m.newsletterSenders }))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))

const { GET, POST } = await import('./route')
const SECRET = 'a-long-test-secret'
const email = { community: 'philly', messageId: 'g1', from: 'Mekor <info@mekor.org>', subject: 'Shabbos', date: '2026-10-16T14:00:00Z', text: 'Mincha 6pm' }
const req = (body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  new Request('http://x/api/inbound/newsletter', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEWSLETTER_SECRET', SECRET)
  vi.stubEnv('OPENAI_API_KEY', 'k')
  m.listCommunities.mockResolvedValue([{ slug: 'philly', name: 'Philadelphia', timezone: 'America/New_York' }])
  m.receiveEruvEmail.mockResolvedValue(null)
  m.receiveNewsletter.mockResolvedValue({ status: 'read', filed: 1 })
  m.newsletterSenders.mockResolvedValue(['info@mekor.org'])
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
      { messageId: 'g1', from: email.from, list: null, subject: 'Shabbos', date: '2026-10-16T14:00:00.000Z', text: 'Mincha 6pm', attachment: { mime: 'application/pdf', b64: 'JVBERg==' } },
      { apiKey: 'k', communityName: 'Philadelphia' },
    )
  })

  // An eruv's status email (the user, Oct 19): read by code, live at once,
  // so it needs no AI key, and never reaches the newsletter reader.
  it('an eruv’s status email is read first, without the AI', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    m.receiveEruvEmail.mockResolvedValue({ status: 'eruv', eruv: 'northeast', read: 'up' })
    const res = await POST(req(email))
    expect(await res.json()).toEqual({ ok: true, status: 'eruv', eruv: 'northeast', read: 'up' })
    expect(m.receiveEruvEmail).toHaveBeenCalledWith('philly', expect.objectContaining({ messageId: 'g1', from: email.from }), { timezone: 'America/New_York' })
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
  })

  it('passes on the list it came through, as the list’s own address', async () => {
    await POST(req({ ...email, list: 'JCOR-NE-Philadelphia+owner@groups.io' }))
    expect(m.receiveEruvEmail.mock.calls[0][1]).toMatchObject({ list: 'jcor-ne-philadelphia@groups.io' })
    await POST(req({ ...email, list: 'not an address' }))
    expect(m.receiveEruvEmail.mock.calls[1][1]).toMatchObject({ list: null })
  })

  it('a shul’s newsletter still needs the AI key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect((await POST(req(email))).status).toBe(503)
    expect(m.receiveEruvEmail).toHaveBeenCalled()
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
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

// The script asks first whose emails to send, so nothing else leaves the
// inbox (the user, Oct 18). The answer names the guide's senders, so it's
// behind the same secret.
describe('GET /api/inbound/newsletter', () => {
  const get = (community: string, auth: string | null = `Bearer ${SECRET}`) =>
    new Request(`http://x/api/inbound/newsletter?community=${community}`, { headers: auth ? { authorization: auth } : {} })

  it('is closed when no secret is set, and to anyone without it', async () => {
    vi.stubEnv('NEWSLETTER_SECRET', '')
    expect((await GET(get('philly'))).status).toBe(503)
    vi.stubEnv('NEWSLETTER_SECRET', SECRET)
    expect((await GET(get('philly', null))).status).toBe(401)
    expect((await GET(get('philly', 'Bearer wrong'))).status).toBe(401)
    expect(m.newsletterSenders).not.toHaveBeenCalled()
  })

  it('names the community’s watched senders, uncached', async () => {
    const res = await GET(get('philly'))
    expect(await res.json()).toEqual({ ok: true, senders: ['info@mekor.org'] })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(m.newsletterSenders).toHaveBeenCalledWith('philly')
  })

  it('refuses an unknown community', async () => {
    expect((await GET(get('nowhere'))).status).toBe(400)
    expect(m.newsletterSenders).not.toHaveBeenCalled()
  })
})
