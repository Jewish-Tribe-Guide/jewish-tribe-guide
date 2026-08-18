// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpvoteButton from './UpvoteButton'
import { getMyVotedIds, getVoterToken } from '@/lib/voteToken'

// The optimistic-then-reconcile dance (flip immediately, correct against
// whatever the server actually says, roll back on failure) is the real logic
// here — a bug in the rollback path leaves a visitor's button lying about
// whether they voted.

vi.mock('@/lib/voteToken', () => ({
  getVoterToken: vi.fn(() => 'voter-token'),
  getMyVotedIds: vi.fn(() => Promise.resolve(new Set<string>())),
}))

beforeEach(() => {
  // vi.clearAllMocks() below resets call history but NOT a mockResolvedValue
  // override from a previous test — re-establish the module mock's default
  // every time so one test's override can't leak into the next.
  vi.mocked(getMyVotedIds).mockResolvedValue(new Set())
  vi.mocked(getVoterToken).mockReturnValue('voter-token')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('UpvoteButton', () => {
  it('shows the initial count and an un-voted state by default', async () => {
    render(<UpvoteButton resourceId="r1" count={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows as voted when the server record says this browser already voted', async () => {
    vi.mocked(getMyVotedIds).mockResolvedValue(new Set(['r1']))
    render(<UpvoteButton resourceId="r1" count={5} />)

    await waitFor(() => expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true'))
  })

  it('shows as voted immediately from the local cache, before the server call resolves', () => {
    localStorage.setItem('jpc_voted', JSON.stringify(['r1']))
    render(<UpvoteButton resourceId="r1" count={5} />)
    // Synchronous — no waitFor — this is the fast local paint, not the
    // server-reconciled state.
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('optimistically increments and marks voted on click, before the request resolves', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveFetch = resolve })))
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button')).toBeDisabled()

    resolveFetch({ ok: true, json: () => Promise.resolve({ ok: true, count: 6, voted: true }) })
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
  })

  it('reconciles to the server\'s authoritative count once the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, count: 6, voted: true }) }),
    )
    const onCountChange = vi.fn()
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} onCountChange={onCountChange} />)

    await user.click(screen.getByRole('button'))

    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(6))
  })

  it('rolls back the optimistic update when the server rejects the vote', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: false }) }))
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} />)

    await user.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('rolls back on a network failure too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} />)

    await user.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
  })

  it('ignores a second click while a request is already in flight', async () => {
    const fetchSpy = vi.fn(() => new Promise(() => {})) // never resolves
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} />)

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('button'))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('sends the resource id and voter token in the request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, count: 6, voted: true }) })
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()
    render(<UpvoteButton resourceId="r1" count={5} />)

    await user.click(screen.getByRole('button'))

    expect(fetchSpy).toHaveBeenCalledWith('/api/votes', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ resourceId: 'r1', token: 'voter-token' }),
    }))
    expect(getVoterToken).toHaveBeenCalled()
  })

  it('stops the click from bubbling to a tappable card header behind it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const onCardClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onCardClick}>
        <UpvoteButton resourceId="r1" count={5} />
      </div>,
    )

    await user.click(screen.getByRole('button'))

    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('renders the compact inline variant used in a collapsed listing header', () => {
    render(<UpvoteButton resourceId="r1" count={5} variant="inline" />)
    expect(screen.getByRole('button')).toHaveTextContent('👍5')
  })

  describe('remembered count (cache-lag correction)', () => {
    // Regression coverage for a real thing a user noticed: vote, leave, come
    // back — the count briefly shows its pre-vote value because the listing
    // page is cached (stale-while-revalidate). A count this browser recently
    // confirmed for itself (straight from the vote response) should win over
    // a server-passed count that looks older, for a bounded window.

    it('corrects a stale-looking server count to the recently-remembered one after mount', async () => {
      localStorage.setItem('jpc_vote_counts', JSON.stringify({ r1: { count: 3, at: Date.now() } }))
      // Server/cache still thinks it's 2 — the exact scenario reported.
      render(<UpvoteButton resourceId="r1" count={2} />)

      await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    })

    it('does not override the server count once the remembered one has expired', async () => {
      const twoHoursAgo = Date.now() - 3 * 60 * 60 * 1000
      localStorage.setItem('jpc_vote_counts', JSON.stringify({ r1: { count: 3, at: twoHoursAgo } }))
      render(<UpvoteButton resourceId="r1" count={2} />)

      // Give the correcting effect a tick to (not) fire, then assert the
      // server's count is still what's shown.
      await waitFor(() => expect(getMyVotedIds).toHaveBeenCalled())
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('remembers the confirmed count after a successful vote, for a later mount to pick up', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, count: 6, voted: true }) }),
      )
      const user = userEvent.setup()
      render(<UpvoteButton resourceId="r1" count={5} />)

      await user.click(screen.getByRole('button'))
      await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument())

      const stored = JSON.parse(localStorage.getItem('jpc_vote_counts') || '{}')
      expect(stored.r1.count).toBe(6)
      expect(stored.r1.at).toBeCloseTo(Date.now(), -2) // within ~tens of ms
    })

    it('leaves an unrelated resource\'s remembered count alone', async () => {
      localStorage.setItem('jpc_vote_counts', JSON.stringify({ other: { count: 99, at: Date.now() } }))
      render(<UpvoteButton resourceId="r1" count={2} />)

      await waitFor(() => expect(getMyVotedIds).toHaveBeenCalled())
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })
})
