import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Your updates" on You (Nov 27, board S4c): where each update a phone sent
// stands, by the ids it kept.
const m = vi.hoisted(() => ({ messages: vi.fn(), states: vi.fn(), listings: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.limit }))
vi.mock('@/lib/serverError', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/sentMessageStore', () => ({ getSentMessages: m.messages }))
vi.mock('@/lib/resourceStore', () => ({ listApprovedResources: m.listings }))
vi.mock('@/lib/yourUpdatesStatus', async (orig) => ({ ...(await orig<typeof import('@/lib/yourUpdatesStatus')>()), getSubmissionStates: m.states }))

const { POST } = await import('./route')
const id = (n: number) => `00000000-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const ask = (body: unknown) => POST(new Request('http://x/api/updates?community=philly', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  m.limit.mockResolvedValue(null)
  m.messages.mockResolvedValue([])
  m.listings.mockResolvedValue([{ id: id(9), name: 'ACME Markets', category: 'grocery' }])
})

describe('POST /api/updates', () => {
  it('says each one live, with its listing, waiting, or not changed; a post through what it was read into', async () => {
    m.messages.mockResolvedValue([{ id: id(5), status: 'filed', submissionIds: [id(3)] }])
    m.states.mockResolvedValue([
      { id: id(1), status: 'approved', reviewed_at: '2026-11-27T12:00:00Z', target_type: 'listing', target_id: id(9) },
      { id: id(2), status: 'rejected', reviewed_at: '2026-11-27T12:00:00Z', target_type: 'listing', target_id: id(9) },
      { id: id(3), status: 'pending', reviewed_at: null, target_type: 'listing', target_id: id(9) },
    ])
    const res = await ask({ submissions: [id(1), id(2), 'nope'], messages: [id(5)] })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(m.states).toHaveBeenCalledWith('philly', [id(1), id(2), id(3)])
    expect((await res.json()).statuses).toEqual({
      [id(1)]: { state: 'live', href: expect.stringMatching(/^\/philly\/grocery\/acme-markets/), at: '2026-11-27T12:00:00Z' },
      [id(2)]: { state: 'not_changed' },
      [id(5)]: { state: 'waiting' },
    })
  })

  it('says nothing of an id it doesn’t find, and reads no listings when nothing is live', async () => {
    m.states.mockResolvedValue([])
    expect((await (await ask({ submissions: [id(1)], messages: [] })).json()).statuses).toEqual({})
    expect(m.listings).not.toHaveBeenCalled()
  })
})
