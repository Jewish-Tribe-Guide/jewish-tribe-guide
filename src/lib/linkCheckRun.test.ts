import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  removeWatch: vi.fn(),
  updateWatch: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'community' ? [{ slug: 'philly' }] : m.rows, error: null }).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/watchStore', () => ({ listWatches: m.listWatches, addWatch: m.addWatch, removeWatch: m.removeWatch, updateWatch: m.updateWatch }))
vi.mock('@/lib/categoryStore', () => ({
  listCategoriesUncached: async () => [
    {
      id: 'restaurant',
      kind: 'listing',
      label: 'Food',
      detailFields: [
        { key: 'website', label: 'Website', type: 'url' },
        { key: 'kosher_url', label: 'Kosher Certification URL', type: 'url' },
      ],
    },
  ],
}))

const { checkAllLinks, checkLink, checkOneLink } = await import('./linkCheckRun')
const { LINK_CHECK_CREATOR, linkCheckUrl } = await import('./linkCheck')

const publicDns = async () => ['93.184.216.34']
const answer = (status: number, location?: string) => new Response(null, { status, headers: location ? { location } : {} })
/** A fake web: each address's answer, by method. */
function web(pages: Record<string, number | [number, string] | { HEAD?: number; GET: number }>) {
  const asked: string[] = []
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    asked.push(`${method} ${url}`)
    const page = pages[url]
    if (page === undefined) throw new TypeError('fetch failed')
    if (typeof page === 'number') return answer(page)
    if (Array.isArray(page)) return answer(page[0], page[1])
    const status = method === 'HEAD' ? page.HEAD : page.GET
    if (status === undefined) throw new TypeError('fetch failed')
    return answer(status)
  }) as typeof fetch
  return { fetchImpl, asked }
}

describe('opening a link', () => {
  it('a page that’s there opens, after a redirect too', async () => {
    const { fetchImpl } = web({ 'https://a.org/': [301, 'https://www.a.org/cert'], 'https://www.a.org/cert': 200 })
    expect(await checkLink('https://a.org/', { fetchImpl, resolve: publicDns })).toBe('opens')
  })

  it('one that’s gone, there or where it leads', async () => {
    const { fetchImpl } = web({ 'https://a.org/old': [301, '/new'], 'https://a.org/new': 404 })
    expect(await checkLink('https://a.org/old', { fetchImpl, resolve: publicDns })).toBe('gone')
  })

  it('asks again with a GET when a site answers a HEAD wrongly', async () => {
    const { fetchImpl, asked } = web({ 'https://a.org/': { HEAD: 405, GET: 200 }, 'https://b.org/': { GET: 200 } })
    expect(await checkLink('https://a.org/', { fetchImpl, resolve: publicDns })).toBe('opens')
    expect(await checkLink('https://b.org/', { fetchImpl, resolve: publicDns })).toBe('opens')
    expect(asked).toEqual(['HEAD https://a.org/', 'GET https://a.org/', 'HEAD https://b.org/', 'GET https://b.org/'])
  })

  it('a site that turns robots away still opens; a server error is no answer', async () => {
    const { fetchImpl } = web({ 'https://a.org/': 403, 'https://b.org/': 503 })
    expect(await checkLink('https://a.org/', { fetchImpl, resolve: publicDns })).toBe('opens')
    expect(await checkLink('https://b.org/', { fetchImpl, resolve: publicDns })).toBe('no_answer')
  })

  it('a site whose name no longer exists, or on a private network, is no such site', async () => {
    const { fetchImpl, asked } = web({})
    const gone = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    expect(await checkLink('https://gone.org/', { fetchImpl, resolve: async () => Promise.reject(gone) })).toBe('no_site')
    expect(await checkLink('https://intranet.org/', { fetchImpl, resolve: async () => ['10.0.0.4'] })).toBe('no_site')
    expect(asked).toEqual([])
  })

  it('a redirect to a private address isn’t followed', async () => {
    const { fetchImpl, asked } = web({ 'https://a.org/': [302, 'http://127.0.0.1/admin'] })
    expect(await checkLink('https://a.org/', { fetchImpl, resolve: publicDns })).toBe('no_site')
    expect(asked).toEqual(['HEAD https://a.org/'])
  })

  it('one that can’t be reached is no answer', async () => {
    const { fetchImpl } = web({})
    expect(await checkLink('https://a.org/', { fetchImpl, resolve: publicDns })).toBe('no_answer')
  })
})

const row = (id: string, name: string, details: Record<string, unknown>) => ({ id, name, category: 'restaurant', status: 'approved', details })
const record = (over: Record<string, unknown>) => ({ id: 'r', kind: 'website', active: false, createdBy: LINK_CHECK_CREATOR, lastRunAt: null, pageHash: null, failingSince: null, lastError: null, ...over })

describe('the weekly run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.rows = [row('p1', 'House of Kosher', { website: 'https://hok.com', kosher_url: 'https://hok.com/cert', googleFields: ['website'] }), row('p2', 'Sababa', { kosher_url: 'https://k.org/sababa' })]
    m.addWatch.mockImplementation(async (_c: string, w: Record<string, unknown>) => ({ ...record({}), ...w, id: `new-${w.url}` }))
  })

  it('checks each link, keeping how it answered on a record that never runs; one no listing shows loses its record', async () => {
    m.listWatches.mockResolvedValue({ available: true, watches: [record({ id: 'old', url: linkCheckUrl('p9', 'kosher_url') })] })
    const { fetchImpl } = web({ 'https://hok.com/cert': 404, 'https://k.org/sababa': 200 })
    expect(await checkAllLinks({ fetchImpl, resolve: publicDns })).toEqual([{ community: 'philly', links: 2, checked: 2, dontOpen: 1, left: 0 }])
    expect(m.removeWatch).toHaveBeenCalledWith('philly', 'old')
    expect(m.addWatch.mock.calls.map((c) => c[1])).toEqual(
      expect.arrayContaining([
        { kind: 'website', url: linkCheckUrl('p1', 'kosher_url'), resourceId: 'p1', label: 'House of Kosher · Kosher Certification URL', createdBy: LINK_CHECK_CREATOR, active: false },
        { kind: 'website', url: linkCheckUrl('p2', 'kosher_url'), resourceId: 'p2', label: 'Sababa · Kosher Certification URL', createdBy: LINK_CHECK_CREATOR, active: false },
      ]),
    )
    // The website Google keeps isn't opened.
    expect(m.addWatch).toHaveBeenCalledTimes(2)
    const saved = Object.fromEntries(m.updateWatch.mock.calls.map((c) => [c[1], c[2]]))
    expect(saved[`new-${linkCheckUrl('p1', 'kosher_url')}`]).toMatchObject({ lastError: 'Not found', pageHash: 'https://hok.com/cert' })
    expect(saved[`new-${linkCheckUrl('p2', 'kosher_url')}`]).toMatchObject({ lastError: null, failingSince: null, pageHash: 'https://k.org/sababa' })
  })

  it('out of time, the rest wait for next week, those checked longest ago first', async () => {
    m.listWatches.mockResolvedValue({ available: true, watches: [record({ id: 'a', url: linkCheckUrl('p1', 'kosher_url'), lastRunAt: '2026-10-18T09:00:00Z' })] })
    const { fetchImpl, asked } = web({ 'https://hok.com/cert': 200, 'https://k.org/sababa': 200 })
    const runs = await checkAllLinks({ fetchImpl, resolve: publicDns, stopAt: 0 })
    expect(runs).toEqual([{ community: 'philly', links: 2, checked: 0, dontOpen: 0, left: 2 }])
    expect(asked).toEqual([])
  })

  it('Check it again: that one link, now', async () => {
    m.listWatches.mockResolvedValue({ available: true, watches: [record({ id: 'a', url: linkCheckUrl('p1', 'kosher_url'), pageHash: 'https://hok.com/cert', failingSince: '2026-10-18T09:00:00Z', lastError: 'Not found' })] })
    const { fetchImpl } = web({ 'https://hok.com/cert': 200 })
    expect(await checkOneLink('philly', 'p1', 'kosher_url', { fetchImpl, resolve: publicDns })).toMatchObject({ id: 'a', error: null, failingSince: null, place: 'House of Kosher' })
    expect(m.updateWatch).toHaveBeenCalledWith('philly', 'a', expect.objectContaining({ lastError: null, failingSince: null }))
    expect(await checkOneLink('philly', 'p1', 'website', { fetchImpl, resolve: publicDns })).toBeNull()
  })
})
