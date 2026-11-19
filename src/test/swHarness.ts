import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

// public/sw.js is a plain script, not a module, so it can't be imported. This
// runs the real file in a sandbox with just enough of the worker environment —
// an in-memory Cache API and a scripted fetch — to drive its handlers.

export const origin = 'https://example.com'

type Headers = { has: (k: string) => boolean; get: (k: string) => string | null }
export type Req = { url: string; method: string; mode: string; headers: Headers }
export type Res = { ok: boolean; status: number; url: string; headers: Headers; clone: () => Res }

const headersOf = (h: Record<string, string> = {}): Headers => {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
  return { has: (k) => k.toLowerCase() in lower, get: (k) => lower[k.toLowerCase()] ?? null }
}

export const req = (path: string, mode = 'navigate', headers: Record<string, string> = {}): Req => ({
  url: origin + path,
  method: 'GET',
  mode,
  headers: headersOf(headers),
})

export function res(url = origin, headers: Record<string, string> = {}, ok = true): Res {
  const r: Res = { ok, status: ok ? 200 : 500, url, headers: headersOf(headers), clone: () => r }
  return r
}

const keyOf = (r: string | { url: string }) => (typeof r === 'string' ? new URL(r, origin).href : r.url)

function makeCache() {
  const store = new Map<string, unknown>()
  return {
    store,
    keys: async () => [...store.keys()].map((url) => ({ url })),
    put: async (r: string | { url: string }, response: unknown) => void store.set(keyOf(r), response),
    delete: async (r: string | { url: string }) => store.delete(keyOf(r)),
    match: async (r: string | { url: string }, options?: { ignoreSearch?: boolean }) => {
      if (!options?.ignoreSearch) return store.get(keyOf(r))
      const path = (u: string) => u.split('?')[0]
      const hit = [...store.keys()].find((k) => path(k) === path(keyOf(r)))
      return hit === undefined ? undefined : store.get(hit)
    },
    add: async (url: string) => void store.set(keyOf(url), res(origin + url)),
  }
}

export type Fetch = (r: string | Req, init?: unknown) => Promise<Res>

/** Loads the worker. `fetch` answers every request it makes; the default
 *  answers each with a success. Timers are the ones installed when this is
 *  called, so a test's fake timers reach the worker. */
export function loadWorker(fetch: Fetch = async (r) => res(typeof r === 'string' ? r : r.url)) {
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
    Date,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    caches: {
      open: async (n: string) => {
        if (!caches.has(n)) caches.set(n, makeCache())
        return caches.get(n)!
      },
      keys: async () => [...caches.keys()],
      delete: async (n: string) => caches.delete(n),
    },
    fetch: (r: string | Req, init?: unknown) => fetch(r, init),
  }
  const code = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')
  vm.runInNewContext(code, sandbox)

  /** Fires the fetch handler. `response` is what the page gets; `settled`
   *  is that and everything the worker kept itself alive for (waitUntil). */
  function dispatchFetch(r: Req) {
    let response: Promise<unknown> | undefined
    const kept: Promise<unknown>[] = []
    handlers.fetch({ request: r, respondWith: (p: Promise<unknown>) => (response = p), waitUntil: (p: Promise<unknown>) => kept.push(p) })
    const answered = response ?? Promise.resolve(undefined)
    return { response: answered, settled: answered.then(async (v) => (await Promise.allSettled(kept), v)) }
  }
  /** Fires the fetch handler and waits for all of it. */
  async function fetchThroughWorker(r: Req) {
    return dispatchFetch(r).settled
  }
  async function message(data: unknown) {
    const kept: Promise<unknown>[] = []
    handlers.message?.({ data, waitUntil: (p: Promise<unknown>) => kept.push(p) })
    await Promise.allSettled(kept)
  }
  async function install() {
    let p: Promise<unknown> | undefined
    handlers.install({ waitUntil: (x: Promise<unknown>) => (p = x) })
    await p
  }
  return { caches, dispatchFetch, fetchThroughWorker, message, install }
}
