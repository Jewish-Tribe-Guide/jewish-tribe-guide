import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadWorker, origin, req, res, type Res } from './swHarness'

// public/sw.js runs in a sandbox (swHarness.ts) with an in-memory Cache API
// and a scripted fetch.

afterEach(() => {
  vi.useRealTimers()
})

describe('service worker content cache', () => {
  it('never grows past its limit, however many distinct URLs are visited', async () => {
    const sw = loadWorker()
    await sw.install()
    for (let i = 0; i < 200; i++) await sw.fetchThroughWorker(req(`/philly/map?q=search-${i}`))

    const content = sw.caches.get('jpc-content-v1')!
    // 60 evictable entries plus the (exempt) offline page.
    expect(content.store.size).toBe(61)
  })

  it('never evicts the offline page, which is what an offline navigation falls back to', async () => {
    const sw = loadWorker()
    await sw.install()
    for (let i = 0; i < 200; i++) await sw.fetchThroughWorker(req(`/philly/grocery?x=${i}`))

    expect(sw.caches.get('jpc-content-v1')!.store.has(origin + '/offline')).toBe(true)
  })

  it('evicts least recently loaded first, so a re-fetched page survives', async () => {
    const sw = loadWorker()
    await sw.install()
    await sw.fetchThroughWorker(req('/philly/keep-me'))
    for (let i = 0; i < 59; i++) await sw.fetchThroughWorker(req(`/philly/p${i}`))
    await sw.fetchThroughWorker(req('/philly/keep-me')) // touched again: now the newest
    for (let i = 0; i < 30; i++) await sw.fetchThroughWorker(req(`/philly/later${i}`))

    const urls = [...sw.caches.get('jpc-content-v1')!.store.keys()]
    expect(urls).toContain(origin + '/philly/keep-me')
    expect(urls).not.toContain(origin + '/philly/p0')
  })
})

// Nov 18, items 35–37 of the public review: an installed or returning
// phone's every page waited on the cache write, a page on one bar hung
// rather than show its saved copy, opening the installed app with no signal
// always showed the offline page, a page reached by a tap was never saved,
// and the script cache grew with every deploy.
describe('service worker on a weak or missing signal', () => {
  /** Resolves with what `p` settled to within a few ticks, or 'pending'. */
  const soon = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), 20))])

  it('hands the page its response before storing the copy', async () => {
    const sw = loadWorker()
    await sw.install()
    const cache = await (async () => {
      await sw.fetchThroughWorker(req('/philly/warm'))
      return sw.caches.get('jpc-content-v1')!
    })()
    // The write is held until the test lets it go.
    let release!: () => void
    const writing = new Promise<void>((started) => {
      const put = cache.put
      cache.put = (r, response) => {
        started()
        return new Promise<void>((resolve) => (release = resolve)).then(() => put(r, response))
      }
    })

    const page = sw.dispatchFetch(req('/philly/grocery'))
    expect(await soon(page.response)).not.toBe('pending')
    await writing
    release()
    await page.settled
    expect(cache.store.has(origin + '/philly/grocery')).toBe(true)
  })

  it('hands a script over before storing it, too', async () => {
    const sw = loadWorker()
    await sw.fetchThroughWorker(req('/_next/static/chunks/warm.js', 'no-cors'))
    const cache = sw.caches.get('jpc-static-v1')!
    cache.put = () => new Promise<undefined>(() => {})
    expect(await soon(sw.dispatchFetch(req('/_next/static/chunks/a.js', 'no-cors')).response)).not.toBe('pending')
  })

  it('shows a slow page’s saved copy after a few seconds, and stores the fresh one when it comes', async () => {
    vi.useFakeTimers()
    let answer!: (r: Res) => void
    let slow = false
    const sw = loadWorker(async (r) => {
      const url = typeof r === 'string' ? r : r.url
      if (!slow) return res(url, { 'x-copy': 'old' })
      return new Promise<Res>((resolve) => (answer = resolve))
    })
    await sw.install()
    await sw.fetchThroughWorker(req('/philly/grocery'))

    slow = true
    const page = sw.dispatchFetch(req('/philly/grocery'))
    await vi.advanceTimersByTimeAsync(4_000)
    const shown = (await page.response) as Res
    expect(shown.headers.get('x-copy')).toBe('old')

    answer(res(origin + '/philly/grocery', { 'x-copy': 'new' }))
    await page.settled
    const stored = (await sw.caches.get('jpc-content-v1')!.match(origin + '/philly/grocery')) as Res
    expect(stored.headers.get('x-copy')).toBe('new')
  })

  it('keeps waiting on a slow page with no saved copy', async () => {
    vi.useFakeTimers()
    let answer!: (r: Res) => void
    const sw = loadWorker((r) => (typeof r === 'string' ? Promise.resolve(res(r)) : new Promise<Res>((resolve) => (answer = resolve))))
    const page = sw.dispatchFetch(req('/philly/never-seen'))
    let settled = false
    void page.response.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(settled).toBe(false)
    answer(res(origin + '/philly/never-seen', { 'x-copy': 'fresh' }))
    expect(((await page.response) as Res).headers.get('x-copy')).toBe('fresh')
  })

  it('with no signal, "/" opens the community home visited last, not the offline page', async () => {
    let online = true
    const sw = loadWorker(async (r) => {
      if (!online) throw new TypeError('Failed to fetch')
      return res(typeof r === 'string' ? r : r.url)
    })
    await sw.install()
    await sw.fetchThroughWorker(req('/ues'))
    await sw.fetchThroughWorker(req('/philly'))
    await sw.fetchThroughWorker(req('/philly/grocery'))

    online = false
    const shown = (await sw.dispatchFetch(req('/')).response) as Res
    expect(shown.url).toBe(origin + '/philly')
  })

  it('with no signal, a page saved without its query string still opens', async () => {
    let online = true
    const sw = loadWorker(async (r) => {
      if (!online) throw new TypeError('Failed to fetch')
      return res(typeof r === 'string' ? r : r.url)
    })
    await sw.install()
    await sw.fetchThroughWorker(req('/philly/grocery'))
    online = false
    const shown = (await sw.dispatchFetch(req('/philly/grocery?item=goldie')).response) as Res
    expect(shown.url).toBe(origin + '/philly/grocery')
  })

  it('stores a page reached by a tap, once, when the page asks', async () => {
    const fetched: string[] = []
    const sw = loadWorker(async (r) => {
      const url = typeof r === 'string' ? r : r.url
      fetched.push(url)
      return res(url, { 'content-type': 'text/html; charset=utf-8', date: new Date().toUTCString() })
    })
    await sw.install()
    await sw.message({ type: 'STORE_PAGE', path: '/philly/grocery' })
    expect(sw.caches.get('jpc-content-v1')!.store.has(origin + '/philly/grocery')).toBe(true)
    await sw.message({ type: 'STORE_PAGE', path: '/philly/grocery' })
    expect(fetched.filter((u) => u.endsWith('/philly/grocery'))).toHaveLength(1)
  })

  it('never stores a tapped admin page', async () => {
    const sw = loadWorker(async (r) => res(typeof r === 'string' ? r : r.url, { 'content-type': 'text/html' }))
    await sw.install()
    await sw.message({ type: 'STORE_PAGE', path: '/admin/philly' })
    expect([...sw.caches.get('jpc-content-v1')!.store.keys()].some((u) => u.includes('/admin'))).toBe(false)
  })

  it('keeps the script cache from growing with every deploy', async () => {
    const sw = loadWorker()
    for (let i = 0; i < 400; i++) await sw.fetchThroughWorker(req(`/_next/static/chunks/${i}.js`, 'no-cors'))
    expect(sw.caches.get('jpc-static-v1')!.store.size).toBeLessThanOrEqual(300)
  })
})
