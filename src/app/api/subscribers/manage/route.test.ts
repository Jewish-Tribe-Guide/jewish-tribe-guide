import { beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.hoisted(() => vi.fn())
vi.mock('@/lib/subscriberStore', () => ({ updateSubscriberByToken: update }))

const { PATCH } = await import('./route')
const patch = (body: unknown) =>
  PATCH(new Request('http://x/api/subscribers/manage', { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  update.mockResolvedValue(true)
})

describe('PATCH /api/subscribers/manage', () => {
  it('400s a body that is not JSON and a missing token, updating nothing', async () => {
    expect((await patch('{')).status).toBe(400)
    expect((await patch({ notifyAdd: true })).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('400s when every notification is turned off', async () => {
    expect((await patch({ token: 't', notifyAdd: false, notifyClosure: false })).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('replaces preferences exactly as submitted, keyed by the token', async () => {
    const res = await patch({ token: 'tok', categories: ['synagogue'], notifyAdd: false, notifyClosure: true })
    expect(await res.json()).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith('tok', { categories: ['synagogue'], notifyAdd: false, notifyClosure: true })
  })

  it('defaults both notifications on, and treats a non-array categories as "all"', async () => {
    await patch({ token: 'tok', categories: 'nope' })
    expect(update).toHaveBeenCalledWith('tok', { categories: null, notifyAdd: true, notifyClosure: true })
  })

  it('404s a token that matches nobody', async () => {
    update.mockResolvedValue(false)
    expect((await patch({ token: 'stale' })).status).toBe(404)
  })

  it('502s when the update fails', async () => {
    update.mockRejectedValue(new Error('db down'))
    expect((await patch({ token: 'tok' })).status).toBe(502)
  })
})
