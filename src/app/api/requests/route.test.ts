import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  verifyTurnstile: vi.fn(),
  resolveCommunity: vi.fn(),
  validateSubmission: vi.fn(),
  insertFormResponse: vi.fn(),
  sendNotification: vi.fn(),
  sendRequestConfirmation: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit, clientIp: () => '1.2.3.4' }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: m.verifyTurnstile }))
vi.mock('@/lib/communityStore', () => ({
  resolveCommunity: m.resolveCommunity,
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
}))
vi.mock('@/lib/requests', () => ({ validateSubmission: m.validateSubmission, generateRequestId: () => 'REQ-1' }))
vi.mock('@/lib/formResponseStore', () => ({ insertFormResponse: m.insertFormResponse }))
vi.mock('@/lib/email', () => ({ sendNotification: m.sendNotification }))
vi.mock('@/lib/confirmationEmail', () => ({ sendRequestConfirmation: m.sendRequestConfirmation }))

const { POST } = await import('./route')
const payload = { requestType: 'support', formId: 'f1', contact: { name: 'A', email: 'a@b.co' }, formData: { q: 'hi' } }
const post = (body: unknown, query = '') =>
  POST(new Request(`http://x/api/requests${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.verifyTurnstile.mockResolvedValue(true)
  m.resolveCommunity.mockResolvedValue({ slug: 'ues' })
  m.validateSubmission.mockReturnValue([])
  m.insertFormResponse.mockResolvedValue(undefined)
  m.sendNotification.mockResolvedValue(undefined)
  m.sendRequestConfirmation.mockResolvedValue(undefined)
})

describe('POST /api/requests', () => {
  it('returns the rate limiter’s response and does nothing else', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post(payload)).status).toBe(429)
    expect(m.insertFormResponse).not.toHaveBeenCalled()
  })

  it('400s a body that is not JSON', async () => {
    expect((await post('{')).status).toBe(400)
    expect(m.insertFormResponse).not.toHaveBeenCalled()
  })

  it('413s an oversized body', async () => {
    expect((await post({ ...payload, formData: { q: 'x'.repeat(100_000) } })).status).toBe(413)
    expect(m.insertFormResponse).not.toHaveBeenCalled()
  })

  it('pretends to accept a honeypot hit but stores and emails nothing', async () => {
    const res = await post({ ...payload, company: 'spam' })
    expect(await res.json()).toEqual({ ok: true, requestId: 'ok' })
    expect(m.insertFormResponse).not.toHaveBeenCalled()
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it('403s with code "turnstile" when verification fails', async () => {
    m.verifyTurnstile.mockResolvedValue(false)
    const res = await post(payload)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('turnstile')
    expect(m.insertFormResponse).not.toHaveBeenCalled()
  })

  it('passes the token from the body, and the caller’s IP, to Turnstile', async () => {
    await post({ ...payload, turnstileToken: 'tok' })
    expect(m.verifyTurnstile).toHaveBeenCalledWith('tok', '1.2.3.4')
  })

  it('400s with the validator’s messages and stores nothing', async () => {
    m.validateSubmission.mockReturnValue(['Email is required.'])
    const res = await post(payload)
    expect(res.status).toBe(400)
    expect((await res.json()).errors).toEqual(['Email is required.'])
    expect(m.insertFormResponse).not.toHaveBeenCalled()
  })

  it('stores the response against the request’s community, then emails both parties', async () => {
    const res = await post(payload, '?community=ues')
    expect(await res.json()).toEqual({ ok: true, requestId: 'REQ-1' })
    expect(m.insertFormResponse).toHaveBeenCalledWith({
      community: 'ues',
      requestId: 'REQ-1',
      requestType: 'support',
      formId: 'f1',
      contact: payload.contact,
      data: payload.formData,
    })
    expect(m.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ formId: 'f1' }), 'REQ-1', expect.any(String), 'ues')
    expect(m.sendRequestConfirmation).toHaveBeenCalledWith(expect.objectContaining({ formId: 'f1' }), 'REQ-1', 'ues')
  })

  it('502s, and sends no email, when saving fails', async () => {
    m.insertFormResponse.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post(payload)).status).toBe(502)
    expect(m.sendNotification).not.toHaveBeenCalled()
    expect(m.sendRequestConfirmation).not.toHaveBeenCalled()
  })

  it('still succeeds, and still sends the confirmation, when the admin notification fails', async () => {
    m.sendNotification.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post(payload)).status).toBe(200)
    expect(m.sendRequestConfirmation).toHaveBeenCalled()
  })

  it('still succeeds when the confirmation email fails', async () => {
    m.sendRequestConfirmation.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post(payload)).status).toBe(200)
  })
})
