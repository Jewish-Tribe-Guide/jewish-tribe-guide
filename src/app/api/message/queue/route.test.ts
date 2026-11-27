import { beforeEach, describe, expect, it, vi } from 'vitest'

// The "+ Add" box's Send for a post (Nov 27, board S1b): kept and answered
// at once; the read happens after the answer has gone.
const m = vi.hoisted(() => ({
  limit: vi.fn(),
  spend: vi.fn(),
  turnstile: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  readAndFile: vi.fn(),
  afterCallbacks: [] as (() => unknown)[],
}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => m.afterCallbacks.push(fn) }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.limit, photoReaderSpend: m.spend, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.turnstile }))
vi.mock('@/lib/serverError', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/site-assets/${p}` } }) }) },
  }),
}))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly', name: 'Philadelphia', ui: {} }) }))
vi.mock('@/lib/sentMessageStore', () => ({ createSentMessage: m.create }))
vi.mock('@/lib/messageFiling', () => ({ readAndFile: m.readAndFile }))

const { POST } = await import('./route')

const send = (fields: Record<string, string>, files: File[] = []) => {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  for (const f of files) body.append('file', f)
  return POST(new Request('http://x/api/message/queue?community=philly', { method: 'POST', body }))
}

beforeEach(() => {
  vi.resetAllMocks()
  m.afterCallbacks.length = 0
  process.env.OPENAI_API_KEY = 'k'
  m.limit.mockResolvedValue(null)
  m.spend.mockResolvedValue(null)
  m.turnstile.mockResolvedValue(true)
  m.upload.mockResolvedValue({ error: null })
  m.create.mockImplementation(async (_c: string, x: object) => ({ id: 'm1', attempts: 0, ...x }))
})

describe('POST /api/message/queue', () => {
  it('keeps the post with its photo and email, answers with its id, and reads it only afterwards', async () => {
    const res = await send({ text: ' ACME has challah ', email: ' Me@X.co ', turnstileToken: 't' }, [new File(['x'], 'a.png', { type: 'image/png' })])
    expect(await res.json()).toEqual({ ok: true, id: 'm1' })
    expect(m.create).toHaveBeenCalledWith('philly', { text: 'ACME has challah', photoUrls: [expect.stringMatching(/site-assets\/message-source\/.+\.png$/)], email: 'me@x.co', listingId: null })
    expect(m.readAndFile).not.toHaveBeenCalled()
    expect(m.afterCallbacks).toHaveLength(1)
    await m.afterCallbacks[0]()
    expect(m.readAndFile).toHaveBeenCalledWith(expect.objectContaining({ slug: 'philly' }), expect.objectContaining({ id: 'm1' }), { apiKey: 'k' })
  })

  it('keeps the listing the box was opened from, and nothing that isn’t an id', async () => {
    const ID = '33333333-aaaa-4aaa-8aaa-000000000003'
    await send({ text: 'ACME has challah', listingId: ID, turnstileToken: 't' })
    await send({ text: 'ACME has challah', listingId: 'nope', turnstileToken: 't' })
    expect(m.create.mock.calls.map((c) => c[1].listingId)).toEqual([ID, null])
  })

  it('refuses nothing to read, a failed bot check, and a day past the readers’ ceiling, keeping nothing', async () => {
    expect((await send({ text: 'hi', turnstileToken: 't' })).status).toBe(400)
    m.turnstile.mockResolvedValue(false)
    expect((await send({ text: 'ACME has challah', turnstileToken: 't' })).status).toBe(403)
    m.turnstile.mockResolvedValue(true)
    m.spend.mockResolvedValue(Response.json({ ok: false, code: 'off' }, { status: 503 }))
    expect((await send({ text: 'ACME has challah', turnstileToken: 't' })).status).toBe(503)
    expect(m.create).not.toHaveBeenCalled()
  })

  it('keeps nothing when a photo can’t be kept', async () => {
    m.upload.mockResolvedValue({ error: { message: 'full' } })
    expect((await send({ text: 'ACME has challah', turnstileToken: 't' }, [new File(['x'], 'a.png', { type: 'image/png' })])).status).toBe(502)
    expect(m.create).not.toHaveBeenCalled()
  })
})
