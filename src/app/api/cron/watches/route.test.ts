import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The cron's call starts a run per community, each a call of its own with
// its own five minutes (Nov 20); a community's call is answered at once and
// its run worked through after (after()). The run itself: watchesRun.test.ts.

const communities = vi.hoisted(() => ({ slugs: ['ues', 'philly'] }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: () => ({ select: async () => ({ data: communities.slugs.map((slug) => ({ slug })), error: null }) }) }),
}))
const mockRun = vi.hoisted(() => vi.fn(async (...args: [community?: string, started?: number]) => (void args, {})))
vi.mock('@/lib/watchesRun', () => ({ runWatches: mockRun }))
const afters = vi.hoisted(() => [] as (() => unknown)[])
vi.mock('next/server', async (real) => ({ ...(await real<typeof import('next/server')>()), after: (fn: () => unknown) => void afters.push(fn) }))

const { GET, POST } = await import('./route')

const request = (query = '', headers: Record<string, string> = {}) => new NextRequest(`https://guide.example/api/cron/watches${query}`, { headers })
const fetched: { url: string; method?: string; headers: Record<string, string> }[] = []

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('CRON_SECRET', '')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      fetched.push({ url: String(url), method: init.method, headers: init.headers as Record<string, string> })
      return new Response('{}', { status: 202 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  mockRun.mockClear()
  fetched.length = 0
  afters.length = 0
  communities.slugs = ['ues', 'philly']
})

describe('/api/cron/watches', () => {
  it('starts a run for each community, each a call of its own, sending the secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const res = await GET(request('', { authorization: 'Bearer s3cret' }))
    expect(res.status).toBe(200)
    expect(fetched.map((f) => f.url).sort()).toEqual(['https://guide.example/api/cron/watches?community=philly', 'https://guide.example/api/cron/watches?community=ues'])
    expect(fetched.every((f) => f.method === 'POST' && f.headers.authorization === 'Bearer s3cret')).toBe(true)
    // None of the runs is made in this call.
    expect(mockRun).not.toHaveBeenCalled()
    expect((await res.json()).communities).toEqual(expect.arrayContaining([expect.objectContaining({ community: 'philly', started: true })]))
  })

  it('says which community’s run didn’t start, and still starts the rest', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => (fetched.push({ url: String(url), headers: {} }), String(url).includes('ues') ? new Response('', { status: 500 }) : new Response('{}', { status: 202 })))
    const res = await GET(request())
    expect(res.status).toBe(502)
    expect((await res.json()).communities).toEqual(
      expect.arrayContaining([expect.objectContaining({ community: 'ues', started: false, status: 500 }), expect.objectContaining({ community: 'philly', started: true })]),
    )
  })

  it('answers a community’s call at once and runs its watches after, its five minutes from the call', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const res = await POST(request('?community=philly'))
    expect(res.status).toBe(202)
    expect(mockRun).not.toHaveBeenCalled()
    expect(afters).toHaveLength(1)
    await afters[0]()
    expect(mockRun).toHaveBeenCalledWith('philly', 1_000)
    expect(fetched).toEqual([])
  })

  it('runs nothing for a community there isn’t', async () => {
    expect((await POST(request('?community=nowhere'))).status).toBe(404)
    expect(afters).toEqual([])
  })

  it('refuses a production request without the cron secret, the community’s call too', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await GET(request())).status).toBe(401)
    expect((await POST(request('?community=philly'))).status).toBe(401)
    expect(fetched).toEqual([])
    expect(afters).toEqual([])
  })
})
