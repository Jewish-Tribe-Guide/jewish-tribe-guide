import { AsyncLocalStorage } from 'node:async_hooks'

// Identical database reads made inside one `shareReads` call go to the
// database once, and every caller gets its own copy of the answer.
//
// Why: the admin's combined jobs read (/api/admin/watches/jobs) runs thirteen
// job routes side by side, and each one reads the same rows on its own: the
// admin list 14 times, the whole watch list 14, the categories 12, each job's
// run history 3. Measured Nov 16: 105 requests to the database for one read,
// about 65 of them repeats. Two admin screens loading at once (CI's two
// workers) sent over 200 together, and an unrelated read queued behind them
// for up to 7s; admin-write's Places and Dismiss failed on exactly that.
//
// Only GETs are shared, only within one call, and only while the first is
// in flight or once it has answered: the same read at the same moment gives
// the same rows, so nothing a route sees changes. A write is never shared,
// and a read made after the call has ended is made afresh.

type Reads = Map<string, Promise<Response>>
const scope = new AsyncLocalStorage<Reads>()

/** Runs `work` with identical database reads inside it shared. */
export function shareReads<T>(work: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), work)
}

function keyOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const request = typeof input === 'object' && 'method' in input ? input : null
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  if (method !== 'GET') return null
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // The headers are part of the read: a row count asked for, a range, whose
  // token the auth check carries.
  const headers = [...new Headers(init?.headers ?? request?.headers).entries()].sort(([a], [b]) => a.localeCompare(b))
  return `${url}\n${JSON.stringify(headers)}`
}

/** fetch, sharing identical reads inside `shareReads`. The admin client's. */
export const sharedFetch: typeof fetch = (input, init) => {
  const reads = scope.getStore()
  const key = reads ? keyOf(input, init) : null
  if (!reads || key === null) return fetch(input, init)
  let first = reads.get(key)
  if (!first) {
    first = fetch(input, init)
    reads.set(key, first)
    // A read that failed to arrive is tried again by the next caller.
    first.catch(() => reads.delete(key))
  }
  // The first answer is never read itself, so each caller's copy is whole.
  return first.then((res) => res.clone())
}
