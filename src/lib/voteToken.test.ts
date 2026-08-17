import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Node's test environment has no localStorage/fetch by default, so both are
// stubbed explicitly rather than relying on whichever Node version happens to
// expose them globally. `getMyVotedIds` memoizes its result at module scope
// (see the file's own comment on why), so tests that need a clean cache
// re-import the module fresh via vi.resetModules().

function mockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

async function freshVoteToken() {
  vi.resetModules()
  return import('./voteToken')
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getVoterToken', () => {
  it('mints and persists a token on first call', async () => {
    const { getVoterToken } = await freshVoteToken()
    const token = getVoterToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
    expect(localStorage.getItem('jpc_voter_token')).toBe(token)
  })

  it('reuses the stored token on subsequent calls, in the same browser', async () => {
    const { getVoterToken } = await freshVoteToken()
    const first = getVoterToken()
    const second = getVoterToken()
    expect(second).toBe(first)
  })

  it('reuses a token that was already in storage from a previous visit', async () => {
    localStorage.setItem('jpc_voter_token', 'existing-token')
    const { getVoterToken } = await freshVoteToken()
    expect(getVoterToken()).toBe('existing-token')
  })
})

describe('getMyVotedIds', () => {
  it('returns an empty set without minting a token when the browser has never voted', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { getMyVotedIds } = await freshVoteToken()

    const ids = await getMyVotedIds()

    expect(ids).toEqual(new Set())
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem('jpc_voter_token')).toBeNull()
  })

  it('fetches the server record for an existing token', async () => {
    localStorage.setItem('jpc_voter_token', 'abc-123')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, resourceIds: ['r1', 'r2'] }),
      }),
    )
    const { getMyVotedIds } = await freshVoteToken()

    expect(await getMyVotedIds()).toEqual(new Set(['r1', 'r2']))
  })

  it('encodes the token in the request URL', async () => {
    localStorage.setItem('jpc_voter_token', 'has space/slash')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, resourceIds: [] }) })
    vi.stubGlobal('fetch', fetchSpy)
    const { getMyVotedIds } = await freshVoteToken()

    await getMyVotedIds()

    expect(fetchSpy).toHaveBeenCalledWith('/api/votes?token=has%20space%2Fslash')
  })

  it('returns an empty set when the server responds not-ok', async () => {
    localStorage.setItem('jpc_voter_token', 'abc-123')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ ok: false }) }))
    const { getMyVotedIds } = await freshVoteToken()

    expect(await getMyVotedIds()).toEqual(new Set())
  })

  it('fails soft to an empty set when the network call throws', async () => {
    localStorage.setItem('jpc_voter_token', 'abc-123')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { getMyVotedIds } = await freshVoteToken()

    expect(await getMyVotedIds()).toEqual(new Set())
  })

  it('memoizes across calls — one request no matter how many callers ask', async () => {
    localStorage.setItem('jpc_voter_token', 'abc-123')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, resourceIds: ['r1'] }) })
    vi.stubGlobal('fetch', fetchSpy)
    const { getMyVotedIds } = await freshVoteToken()

    await Promise.all([getMyVotedIds(), getMyVotedIds(), getMyVotedIds()])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
