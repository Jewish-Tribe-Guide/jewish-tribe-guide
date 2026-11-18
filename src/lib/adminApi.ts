import { fetchJson } from './fetchJson'
import { withCommunity } from './useCommunityData'

// Every admin screen's request to /api/admin/*, in one place. It used to be
// written by hand ~76 times — `Authorization: Bearer ${token}`, then
// `withCommunity(...)`, then `fetchJson` — in four different shapes, and a
// call that forgot the community was answered for the config community
// instead: the category preview showed Philly's places in every other
// community (fixed in d334c89b). Here the token and the community are
// added by the one function that builds the request, so a screen can't
// leave either off. `src/test/adminApiCalls.test.ts` fails if a file under
// src/components/admin builds the header or the community query itself.
//
// `community: null` is for the site-wide routes the superadmin console
// calls (communities, pages), which belong to no one community.

export type Json = Record<string, unknown> | unknown[]
export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type AdminApi = {
  /** The token as it is now (it changes about once an hour). */
  readonly token: string
  readonly community: string | null
  /** The path with the community added (unchanged for a site-wide api). */
  url(path: string): string
  /** The response itself, for a caller that branches on its status (a 401
   *  that means "not an admin here" rather than an error). */
  fetch(path: string, init?: { method?: Method; body?: unknown; signal?: AbortSignal }): Promise<Response>
  /** GET, the body's JSON if it says ok, else throws `fallback` (or the
   *  route's own errors). */
  get<T = Record<string, unknown>>(path: string, fallback?: string): Promise<T>
  /** A write with a JSON body (or none). Same errors as `get`. */
  send<T = Record<string, unknown>>(method: Method, path: string, body?: unknown, fallback?: string): Promise<T>
  /** `send('POST', …)`, the common case. */
  post<T = Record<string, unknown>>(path: string, body?: unknown, fallback?: string): Promise<T>
}

const DEFAULT_FAILURE = 'Could not do that.'

/** `token`: the token, or how to read the latest one. A screen keeps one
 *  api across Supabase's hourly new token (useAdminApi), so a load keyed on
 *  the api doesn't run again and put the saved values back over a draft. */
export function adminApi(tokenOf: string | (() => string), community: string | null): AdminApi {
  const current = typeof tokenOf === 'function' ? tokenOf : () => tokenOf
  const url = (path: string) => (community === null ? path : withCommunity(path, community))
  const initOf = (init: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): RequestInit => {
    // A FormData body (a photo upload) goes as it is, and the browser sets
    // its own multipart Content-Type; anything else is sent as JSON.
    const form = init.body instanceof FormData
    const json = init.body !== undefined && !form
    return {
      ...(init.method && init.method !== 'GET' ? { method: init.method } : {}),
      headers: json ? { 'Content-Type': 'application/json', Authorization: `Bearer ${current()}` } : { Authorization: `Bearer ${current()}` },
      ...(form ? { body: init.body as FormData } : json ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    }
  }
  const request = (path: string, init?: { method?: Method; body?: unknown; signal?: AbortSignal }) => fetch(url(path), initOf(init))
  // Through fetchJson, as every call was before, so its tests' mocks of it
  // still see each request.
  const send = <T,>(method: Method, path: string, body?: unknown, fallback = DEFAULT_FAILURE) =>
    fetchJson<T>(url(path), initOf({ method, body }), fallback)
  return {
    get token() {
      return current()
    },
    community,
    url,
    fetch: request,
    get: <T,>(path: string, fallback = DEFAULT_FAILURE) => send<T>('GET', path, undefined, fallback),
    send,
    post: <T,>(path: string, body?: unknown, fallback = DEFAULT_FAILURE) => send<T>('POST', path, body, fallback),
  }
}
