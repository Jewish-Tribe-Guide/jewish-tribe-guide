import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// public/sw.js is a plain script, not a module, so it can't be imported. This
// runs the real file in a sandbox with just enough of the worker environment —
// an in-memory Cache API and a scripted fetch — to drive its fetch handler.

type Req = { url: string; method: string; mode: string; headers: { has: (k: string) => boolean } }
const origin = 'https://example.com'
const req = (path: string, mode = 'navigate'): Req => ({
  url: origin + path,
  method: 'GET',
  mode,
  headers: { has: () => false },
})

function makeCache() {
  const store = new Map<string, unknown>()
  return {
    store,
    keys: async () => [...store.keys()].map((url) => ({ url })),
    put: async (r: { url: string }, res: unknown) => void store.set(r.url, res),
    delete: async (r: { url: string }) => store.delete(r.url),
    match: async (r: { url: string }) => store.get(r.url),
    add: async (url: string) => void store.set(origin + url, { ok: true }),
  }
}

function load() {
  const caches = new Map<string, ReturnType<typeof makeCache>>()
  const handlers: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { origin },
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  }
  const sandbox = {
    self,
    URL,
    caches: {
      open: async (n: string) => {
        if (!caches.has(n)) caches.set(n, makeCache())
        return caches.get(n)!
      },
      keys: async () => [...caches.keys()],
      delete: async (n: string) => caches.delete(n),
    },
    fetch: async () => ({ ok: true, clone() { return this } }),
  }
  const code = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
  vm.runInNewContext(code, sandbox)

  /** Fires the fetch handler and resolves once it has responded. */
  async function fetchThroughWorker(r: Req) {
    let done: Promise<unknown> | undefined
    handlers.fetch({ request: r, respondWith: (p: Promise<unknown>) => (done = p) })
    await done
  }
  async function install() {
    let p: Promise<unknown> | undefined
    handlers.install({ waitUntil: (x: Promise<unknown>) => (p = x) })
    await p
  }
  return { caches, fetchThroughWorker, install }
}

describe('service worker content cache', () => {
  it('never grows past its limit, however many distinct URLs are visited', async () => {
    const sw = load()
    await sw.install()
    for (let i = 0; i < 200; i++) await sw.fetchThroughWorker(req(`/philly/map?q=search-${i}`))

    const content = sw.caches.get('jpc-content-v1')!
    // 60 evictable entries plus the (exempt) offline page.
    expect(content.store.size).toBe(61)
  })

  it('never evicts the offline page, which is what an offline navigation falls back to', async () => {
    const sw = load()
    await sw.install()
    for (let i = 0; i < 200; i++) await sw.fetchThroughWorker(req(`/philly/grocery?x=${i}`))

    expect(sw.caches.get('jpc-content-v1')!.store.has(origin + '/offline')).toBe(true)
  })

  it('evicts least recently loaded first, so a re-fetched page survives', async () => {
    const sw = load()
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
