// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// UpvoteButton.test.tsx mocks @/lib/voteToken, so it can't see a bug that
// lives between the two. This one uses the real module, because that's where
// it was (the user, Oct 15): upvote, leave the listing, come back, tap again
// to take it back — and the count went UP first, then down. getMyVotedIds
// memoizes the server's list for the life of the tab, so it still held the
// list from before the vote; on coming back the button trusted that over
// this browser's own record, decided it hadn't voted, and added one before
// the server's answer (vote removed) brought it back down.

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('taking back an upvote after leaving and coming back counts down, never up first', async () => {
  localStorage.setItem('jpc_voter_token', 'voter-token')
  let serverVoted = false
  let pendingPost: ((r: unknown) => void) | null = null
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, resourceIds: serverVoted ? ['r1'] : [] }) })
      }
      serverVoted = !serverVoted
      const body = { ok: true, count: serverVoted ? 6 : 5, voted: serverVoted }
      return new Promise((resolve) => {
        pendingPost = () => resolve({ ok: true, json: () => Promise.resolve(body) })
      })
    }),
  )
  const { default: UpvoteButton } = await import('./UpvoteButton')
  const user = userEvent.setup()

  // First visit: upvote.
  const first = render(<UpvoteButton resourceId="r1" count={5} />)
  await act(async () => {}) // the server's list arrives (empty)
  await user.click(screen.getByRole('button'))
  await act(async () => pendingPost!(null))
  await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument())
  first.unmount()

  // Back again, in the same tab. The page itself is cached, so it still says 5.
  render(<UpvoteButton resourceId="r1" count={5} />)
  await act(async () => {})
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('6')).toBeInTheDocument()

  // Take it back: the count it shows while the request is out is 5, not 7.
  await user.click(screen.getByRole('button'))
  expect(screen.getByText('5')).toBeInTheDocument()
  await act(async () => pendingPost!(null))
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText('5')).toBeInTheDocument()
})
