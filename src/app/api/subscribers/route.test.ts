import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  resolveCommunity: vi.fn(),
  createSubscriber: vi.fn(),
  sendSubscribeConfirmation: vi.fn(),
  after: vi.fn(),
}))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/communityStore', () => ({
  resolveCommunity: m.resolveCommunity,
  communitySlugFromRequest: (r: Request) => new URL(r.url).searchParams.get('community'),
}))
vi.mock('@/lib/subscriberStore', () => ({ createSubscriber: m.createSubscriber }))
vi.mock('@/lib/subscriberEmail', () => ({ sendSubscribeConfirmation: m.sendSubscribeConfirmation }))
vi.mock('next/server', () => ({ after: m.after }))

const { POST } = await import('./route')
const post = (body: unknown, query = '') =>
  POST(new Request(`http://x/api/subscribers${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.enforceRateLimit.mockResolvedValue(null)
  m.resolveCommunity.mockResolvedValue({ slug: 'ues' })
  m.createSubscriber.mockResolvedValue({ id: 'sub1', email: 'a@b.co' })
  m.sendSubscribeConfirmation.mockResolvedValue(undefined)
})

describe('POST /api/subscribers', () => {
  it('returns the rate limiter’s response and does nothing else', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post({ email: 'a@b.co' })).status).toBe(429)
    expect(m.createSubscriber).not.toHaveBeenCalled()
  })

  it('400s on a body that is not JSON', async () => {
    expect((await post('{')).status).toBe(400)
    expect(m.createSubscriber).not.toHaveBeenCalled()
  })

  it('pretends to accept a honeypot hit but subscribes nobody', async () => {
    const res = await post({ email: 'a@b.co', company: 'spam' })
    expect(await res.json()).toEqual({ ok: true })
    expect(m.createSubscriber).not.toHaveBeenCalled()
  })

  it.each(['', 'nope', 'a@b', '@b.co', 'a b@c.co'])('400s the email %j', async (email) => {
    expect((await post({ email })).status).toBe(400)
    expect(m.createSubscriber).not.toHaveBeenCalled()
  })

  it('400s when the visitor turned every notification off', async () => {
    const res = await post({ email: 'a@b.co', notifyAdd: false, notifyClosure: false })
    expect(res.status).toBe(400)
    expect(m.createSubscriber).not.toHaveBeenCalled()
  })

  it('defaults both notifications on and subscribes to every category', async () => {
    await post({ email: '  a@b.co  ' }, '?community=ues')
    expect(m.resolveCommunity).toHaveBeenCalledWith('ues')
    expect(m.createSubscriber).toHaveBeenCalledWith('ues', {
      email: 'a@b.co',
      categories: null,
      notifyAdd: true,
      notifyClosure: true,
    })
  })

  it('passes chosen categories and a single notification type through', async () => {
    await post({ email: 'a@b.co', categories: ['synagogue'], notifyAdd: false })
    expect(m.createSubscriber).toHaveBeenCalledWith('ues', {
      email: 'a@b.co',
      categories: ['synagogue'],
      notifyAdd: false,
      notifyClosure: true,
    })
  })

  it('ignores a categories value that is not an array', async () => {
    await post({ email: 'a@b.co', categories: 'synagogue' })
    expect(m.createSubscriber.mock.calls[0][1].categories).toBeNull()
  })

  it('confirms by email after the response, and a failed email never fails the signup', async () => {
    m.sendSubscribeConfirmation.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ email: 'a@b.co' })
    expect(await res.json()).toEqual({ ok: true })
    expect(m.after).toHaveBeenCalledTimes(1)
    await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined()
    expect(m.sendSubscribeConfirmation).toHaveBeenCalledWith({ id: 'sub1', email: 'a@b.co' })
  })

  it('502s, and sends no email, when saving fails', async () => {
    m.createSubscriber.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post({ email: 'a@b.co' })).status).toBe(502)
    expect(m.after).not.toHaveBeenCalled()
  })
})
