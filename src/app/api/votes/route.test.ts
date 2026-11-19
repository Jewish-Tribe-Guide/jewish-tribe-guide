import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A vote deliberately does NOT call revalidatePublicContent() (see POST's own
// comment for the reasoning: votes are frequent and low-stakes, unlike every
// other write path here — invalidating every content tag for every community
// on each one would defeat the point of caching listing pages). This is the
// one thing worth locking down with a test, since "a write path silently
// starts revalidating again" is exactly the kind of regression that looks
// like nothing broke — the app still works, it just gets slower under load.

const mockToggleVote = vi.hoisted(() => vi.fn())
const mockGetVotedResourceIds = vi.hoisted(() => vi.fn())
const mockCanVote = vi.hoisted(() => vi.fn())
vi.mock('@/lib/voteStore', () => ({
  canVote: mockCanVote,
  toggleVote: mockToggleVote,
  getVotedResourceIds: mockGetVotedResourceIds,
}))

const mockRevalidatePublicContent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: mockRevalidatePublicContent }))

const { POST, GET } = await import('./route')

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const R1 = '11111111-1111-4111-8111-111111111111'
const T1 = '22222222-2222-4222-8222-222222222222'
let n = 0
/** A listing id of its own per test, so the per-listing limit starts empty. */
const freshId = () => `33333333-3333-4333-8333-${String(++n).padStart(12, '0')}`
const freshToken = () => crypto.randomUUID()

describe('POST /api/votes', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  beforeEach(() => {
    mockCanVote.mockResolvedValue(true)
  })

  it('never calls revalidatePublicContent, even on a successful vote', async () => {
    mockToggleVote.mockResolvedValue({ voted: true, count: 3 })

    const res = await POST(postRequest({ resourceId: R1, token: T1 }))
    const body = await res.json()

    expect(body).toEqual({ ok: true, voted: true, count: 3 })
    expect(mockRevalidatePublicContent).not.toHaveBeenCalled()
  })

  it('rejects a request missing resourceId or token before touching the vote store', async () => {
    const res = await POST(postRequest({ resourceId: R1 }))
    expect(res.status).toBe(400)
    expect(mockToggleVote).not.toHaveBeenCalled()
  })

  // Nov 18 review, item 32: a loop making a new token per request could push
  // any listing's count up, one listing at a time, 30 a minute.
  it('takes a few taps on one listing from one machine, then refuses', async () => {
    mockToggleVote.mockResolvedValue({ voted: true, count: 1 })
    const id = freshId()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await POST(postRequest({ resourceId: id, token: freshToken() }))).status)
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429])
    expect(mockToggleVote).toHaveBeenCalledTimes(4)
  })

  it('refuses a listing that is not on the site or does not take votes', async () => {
    mockCanVote.mockResolvedValue(false)
    const res = await POST(postRequest({ resourceId: freshId(), token: freshToken() }))
    expect(res.status).toBe(404)
    expect(mockToggleVote).not.toHaveBeenCalled()
  })

  it('400s an id or token that is not a UUID', async () => {
    expect((await POST(postRequest({ resourceId: 'r1', token: freshToken() }))).status).toBe(400)
    expect((await POST(postRequest({ resourceId: freshId(), token: 'x' }))).status).toBe(400)
    expect(mockToggleVote).not.toHaveBeenCalled()
  })
})

describe('GET /api/votes', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reads the token from the x-vote-token header', async () => {
    mockGetVotedResourceIds.mockResolvedValue(['r1'])
    const res = await GET(new NextRequest('http://localhost/api/votes', { headers: { 'x-vote-token': 't1' } }))

    expect(await res.json()).toEqual({ ok: true, resourceIds: ['r1'] })
    expect(mockGetVotedResourceIds).toHaveBeenCalledWith('t1')
  })

  it('ignores a token in the query string (clean cut — it would land in logs)', async () => {
    const res = await GET(new NextRequest('http://localhost/api/votes?token=t1'))

    expect(res.status).toBe(400)
    expect(mockGetVotedResourceIds).not.toHaveBeenCalled()
  })
})
