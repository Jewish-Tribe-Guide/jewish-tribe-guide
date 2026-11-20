import { beforeEach, describe, expect, it, vi } from 'vitest'

// History comes fifty at a time (Nov 20); the queue whole.

const m = vi.hoisted(() => ({ getAdminUserForCommunity: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/adminAuth', () => ({ getAdminUserForCommunity: m.getAdminUserForCommunity }))
vi.mock('@/lib/communityStore', () => ({ communitySlugFromRequest: () => 'philly', resolveCommunity: async () => ({ slug: 'philly' }) }))
vi.mock('@/lib/submissionStore', () => ({ listSubmissionsByStatus: m.list }))

const { GET } = await import('./route')
const get = (query: string) => GET(new Request(`http://x/api/admin/submissions${query}`))
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }))
const ID = '0b6f8a52-3c1d-4e8b-9f0a-2d4c6e8a1b3c'

beforeEach(() => {
  vi.clearAllMocks()
  m.getAdminUserForCommunity.mockResolvedValue({ email: 'me@x.co' })
})

describe('/api/admin/submissions', () => {
  it('the queue whole', async () => {
    m.list.mockResolvedValue(rows(80))
    const body = await (await get('')).json()
    expect(m.list).toHaveBeenCalledWith('philly', 'pending')
    expect(body.submissions).toHaveLength(80)
  })

  it('History fifty at a time, saying when there are older', async () => {
    m.list.mockResolvedValue(rows(51))
    const body = await (await get('?status=approved')).json()
    expect(m.list).toHaveBeenCalledWith('philly', 'approved', { limit: 51, before: undefined })
    expect(body.submissions).toHaveLength(50)
    expect(body.more).toBe(true)
  })

  it('the last page says there are none older', async () => {
    m.list.mockResolvedValue(rows(12))
    expect((await (await get('?status=rejected')).json()).more).toBe(false)
  })

  it('the next page starts after the last one shown', async () => {
    m.list.mockResolvedValue([])
    await get(`?status=approved&before=2026-11-19T10:00:00.123%2B00:00&beforeId=${ID}`)
    expect(m.list).toHaveBeenCalledWith('philly', 'approved', { limit: 51, before: { at: '2026-11-19T10:00:00.123+00:00', id: ID } })
  })

  it('refuses a cursor that isn’t a time and an id, as it goes into the filter', async () => {
    for (const q of [`?status=approved&before=x),id.gt.0&beforeId=${ID}`, '?status=approved&before=2026-11-19T10:00:00Z&beforeId=x,y', '?status=approved&before=2026-11-19T10:00:00Z']) {
      expect((await get(q)).status).toBe(400)
    }
    expect(m.list).not.toHaveBeenCalled()
  })
})
