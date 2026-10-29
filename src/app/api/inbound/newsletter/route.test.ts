import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The door the guide's Gmail script knocks on: its own secret, a real
// community, and what became of the email in the answer.
const m = vi.hoisted(() => ({
  receiveNewsletter: vi.fn(),
  newsletterSenders: vi.fn(),
  listCommunities: vi.fn(),
  receiveEruvEmail: vi.fn(),
  communityOfNewsletterKey: vi.fn(),
  recordNewsletterCheck: vi.fn(),
}))
vi.mock('@/lib/newsletterSetupStore', () => ({ communityOfNewsletterKey: m.communityOfNewsletterKey, recordNewsletterCheck: m.recordNewsletterCheck }))
vi.mock('@/lib/eruvEmailRun', () => ({ receiveEruvEmail: m.receiveEruvEmail }))
vi.mock('@/lib/newsletterRun', () => ({ receiveNewsletter: m.receiveNewsletter, newsletterSenders: m.newsletterSenders }))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))

const { GET, POST } = await import('./route')
const SECRET = 'a-long-test-secret'
const RIVERTON_KEY = 'nl_riverton-own-key'
const email = { community: 'philly', messageId: 'g1', from: 'Mekor <info@mekor.org>', subject: 'Shabbos', date: '2026-10-16T14:00:00Z', text: 'Mincha 6pm' }
const req = (body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  new Request('http://x/api/inbound/newsletter', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEWSLETTER_SECRET', SECRET)
  vi.stubEnv('OPENAI_API_KEY', 'k')
  m.receiveEruvEmail.mockResolvedValue(null)
  m.receiveNewsletter.mockResolvedValue({ status: 'read', filed: 1 })
  m.newsletterSenders.mockResolvedValue(['info@mekor.org'])
  m.listCommunities.mockResolvedValue([
    { slug: 'philly', name: 'Philadelphia', timezone: 'America/New_York' },
    { slug: 'riverton', name: 'Riverton', timezone: 'America/New_York' },
  ])
  // Each community's own key (migration 090): Riverton's alone here.
  m.communityOfNewsletterKey.mockImplementation(async (key: string) => (key === RIVERTON_KEY ? 'riverton' : null))
  m.recordNewsletterCheck.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/inbound/newsletter', () => {
  it('is closed to anyone without a key', async () => {
    expect((await POST(req(email, null))).status).toBe(401)
    expect((await POST(req(email, 'Bearer wrong'))).status).toBe(401)
    expect((await POST(req(email, `Bearer ${SECRET}x`))).status).toBe(401)
    // The same length, one letter off.
    expect((await POST(req(email, `Bearer ${SECRET.slice(0, -1)}X`))).status).toBe(401)
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
  })

  // Oct 29: the console hands each community a script with its own key, so
  // a community's admin never holds the key to every other community.
  it('takes a community’s own key for that community alone', async () => {
    expect((await POST(req({ ...email, community: 'riverton' }, `Bearer ${RIVERTON_KEY}`))).status).toBe(200)
    expect(m.receiveNewsletter).toHaveBeenCalledWith('riverton', expect.anything(), expect.anything())
    m.receiveNewsletter.mockClear()
    expect((await POST(req(email, `Bearer ${RIVERTON_KEY}`))).status).toBe(401)
    expect(m.receiveNewsletter).not.toHaveBeenCalled()
  })

  it('without NEWSLETTER_SECRET, only a community’s own key opens it', async () => {
    vi.stubEnv('NEWSLETTER_SECRET', '')
    expect((await POST(req(email))).status).toBe(401)
    expect((await POST(req({ ...email, community: 'riverton' }, `Bearer ${RIVERTON_KEY}`))).status).toBe(200)
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

  it('is closed to anyone without a key, and to another community’s', async () => {
    expect((await GET(get('philly', null))).status).toBe(401)
    expect((await GET(get('philly', 'Bearer wrong'))).status).toBe(401)
    expect((await GET(get('philly', `Bearer ${RIVERTON_KEY}`))).status).toBe(401)
    expect(m.newsletterSenders).not.toHaveBeenCalled()
    expect(m.recordNewsletterCheck).not.toHaveBeenCalled()
  })

  // Asked every hour, so the asking says the script is running: the
  // Newsletters page's "Checking … every hour · Last checked 3:00 PM".
  it('records that the script checked in, and the Gmail it runs in', async () => {
    const withAccount = new Request('http://x/api/inbound/newsletter?community=riverton', {
      headers: { authorization: `Bearer ${RIVERTON_KEY}`, 'x-guide-account': 'Riverton.Guide@gmail.com' },
    })
    expect(await (await GET(withAccount)).json()).toEqual({ ok: true, senders: ['info@mekor.org'] })
    expect(m.recordNewsletterCheck).toHaveBeenCalledWith('riverton', 'riverton.guide@gmail.com')
    await GET(get('philly'))
    expect(m.recordNewsletterCheck).toHaveBeenLastCalledWith('philly', null)
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
