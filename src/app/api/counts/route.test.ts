import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), rpc: vi.fn(), listCommunities: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ enforceRateLimit: m.enforceRateLimit }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/communityStore', () => ({ listCommunities: m.listCommunities }))

const { POST } = await import('./route')
const ID = '0b6c4c1e-2f55-4a8e-9d57-3b7f0d6f4a21'
// sendBeacon posts the JSON as the raw body, so that's what these send.
const post = (body: unknown) =>
  POST(new Request('http://x/api/counts', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
  m.enforceRateLimit.mockResolvedValue(null)
  m.rpc.mockResolvedValue({ error: null })
  m.listCommunities.mockResolvedValue([{ slug: 'philly', timezone: 'America/New_York' }])
})

describe('POST /api/counts', () => {
  it('counts a listing view on the community’s own day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T03:30:00.000Z')) // Friday night in Philly
    const res = await post({ community: 'philly', kind: 'listing_view', key: ID.toUpperCase() })
    expect(res.status).toBe(204)
    expect(m.rpc).toHaveBeenCalledWith('bump_daily_count', {
      p_community: 'philly',
      p_kind: 'listing_view',
      p_key: ID,
      p_day: '2026-09-25',
    })
  })

  it('counts a search miss by its normalised text', async () => {
    await post({ community: 'philly', kind: 'search_miss', key: '  Chalav  Yisroel ' })
    expect(m.rpc.mock.calls[0][1]).toMatchObject({ p_kind: 'search_miss', p_key: 'chalav yisroel' })
  })

  for (const [label, body] of [
    ['an unknown kind', { community: 'philly', kind: 'vote', key: ID }],
    ['a view of something that isn’t a listing id', { community: 'philly', kind: 'listing_view', key: 'r1' }],
    ['a search miss that looks like an email', { community: 'philly', kind: 'search_miss', key: 'me@example.com' }],
    ['an unknown community', { community: 'nowhere', kind: 'listing_view', key: ID }],
    ['a body that isn’t JSON', 'not json'],
  ] as const) {
    it(`refuses ${label} without writing`, async () => {
      expect((await post(body)).status).toBe(400)
      expect(m.rpc).not.toHaveBeenCalled()
    })
  }

  it('returns the rate limiter’s response and writes nothing', async () => {
    m.enforceRateLimit.mockResolvedValue(new Response('slow', { status: 429 }))
    expect((await post({ community: 'philly', kind: 'listing_view', key: ID })).status).toBe(429)
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('502s when the database call fails', async () => {
    m.rpc.mockResolvedValue({ error: { message: 'boom' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post({ community: 'philly', kind: 'listing_view', key: ID })).status).toBe(502)
  })
})
