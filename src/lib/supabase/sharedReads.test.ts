import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareReads, sharedFetch } from './sharedReads'

// The combined jobs read made 105 database requests, about 65 of them the
// same read again (sharedReads.ts). These pin what's shared and what never is.

const sent: { url: string; method: string }[] = []
let failNext = false

function stubDatabase() {
  sent.length = 0
  failNext = false
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    sent.push({ url, method: init?.method ?? 'GET' })
    await new Promise((r) => setTimeout(r, 5))
    if (failNext) {
      failNext = false
      throw new TypeError('fetch failed')
    }
    return new Response(JSON.stringify({ url, n: sent.length }), { headers: { 'content-type': 'application/json' } })
  })
}
afterEach(() => vi.unstubAllGlobals())

const read = (url: string, headers: Record<string, string> = { apikey: 'k' }) =>
  sharedFetch(url, { headers }).then((r) => r.json() as Promise<{ url: string; n: number }>)

describe('shareReads', () => {
  it('makes an identical read once, and every caller gets the whole answer', async () => {
    stubDatabase()
    const answers = await shareReads(() => Promise.all([read('https://db/watch'), read('https://db/watch'), read('https://db/watch')]))
    expect(sent).toHaveLength(1)
    expect(answers).toEqual([{ url: 'https://db/watch', n: 1 }, { url: 'https://db/watch', n: 1 }, { url: 'https://db/watch', n: 1 }])
  })

  it('shares a read already answered, later in the same call', async () => {
    stubDatabase()
    await shareReads(async () => {
      await read('https://db/category')
      await read('https://db/category')
    })
    expect(sent).toHaveLength(1)
  })

  it('makes different reads, and the same read with other headers, separately', async () => {
    stubDatabase()
    await shareReads(() =>
      Promise.all([read('https://db/watch'), read('https://db/category'), read('https://db/watch', { apikey: 'k', Prefer: 'count=exact' }), read('https://db/user', { Authorization: 'Bearer a' }), read('https://db/user', { Authorization: 'Bearer b' })]),
    )
    expect(sent).toHaveLength(5)
  })

  it('never shares a write', async () => {
    stubDatabase()
    await shareReads(() => Promise.all([sharedFetch('https://db/watch', { method: 'PATCH', body: '{}' }), sharedFetch('https://db/watch', { method: 'PATCH', body: '{}' })]))
    expect(sent.map((s) => s.method)).toEqual(['PATCH', 'PATCH'])
  })

  it('shares nothing outside a call, or between two calls', async () => {
    stubDatabase()
    await Promise.all([read('https://db/watch'), read('https://db/watch')])
    expect(sent).toHaveLength(2)
    await Promise.all([shareReads(() => read('https://db/watch')), shareReads(() => read('https://db/watch'))])
    expect(sent).toHaveLength(4)
  })

  it('tries a read that failed to arrive again, rather than sharing the failure', async () => {
    stubDatabase()
    await shareReads(async () => {
      failNext = true
      await expect(read('https://db/watch')).rejects.toThrow('fetch failed')
      await expect(read('https://db/watch')).resolves.toMatchObject({ url: 'https://db/watch' })
    })
    expect(sent).toHaveLength(2)
  })
})
