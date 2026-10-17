import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ attach: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.limit }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/submissionStore', () => ({ attachSubmitterEmail: m.attach }))

const { POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
const post = (body: unknown) => POST(new Request('http://x/api/message/email?community=philly', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.limit.mockResolvedValue(null)
  m.attach.mockResolvedValue(1)
})

// The box's email, asked once after its last Send (Oct 5).
describe('POST /api/message/email', () => {
  it('adds the email to the ids the box was handed, tidied, dropping anything that isn’t one', async () => {
    expect(await (await post({ ids: [ID, 'nope', 7], email: ' Me@X.co ' })).json()).toEqual({ ok: true, updated: 1 })
    expect(m.attach).toHaveBeenCalledWith('philly', [ID], 'me@x.co')
  })

  it('refuses without an email or an id', async () => {
    expect((await post({ ids: [ID], email: 'not an email' })).status).toBe(400)
    expect((await post({ ids: [], email: 'me@x.co' })).status).toBe(400)
    expect(m.attach).not.toHaveBeenCalled()
  })
})
