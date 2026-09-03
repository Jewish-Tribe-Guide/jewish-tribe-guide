import { afterEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('@/lib/voteStore', () => ({
  toggleVote: mockToggleVote,
  getVotedResourceIds: mockGetVotedResourceIds,
}))

const mockRevalidatePublicContent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/revalidateContent', () => ({ revalidatePublicContent: mockRevalidatePublicContent }))

const { POST } = await import('./route')

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/votes', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('never calls revalidatePublicContent, even on a successful vote', async () => {
    mockToggleVote.mockResolvedValue({ voted: true, count: 3 })

    const res = await POST(postRequest({ resourceId: 'r1', token: 't1' }))
    const body = await res.json()

    expect(body).toEqual({ ok: true, voted: true, count: 3 })
    expect(mockRevalidatePublicContent).not.toHaveBeenCalled()
  })

  it('rejects a request missing resourceId or token before touching the vote store', async () => {
    const res = await POST(postRequest({ resourceId: 'r1' }))
    expect(res.status).toBe(400)
    expect(mockToggleVote).not.toHaveBeenCalled()
  })
})
