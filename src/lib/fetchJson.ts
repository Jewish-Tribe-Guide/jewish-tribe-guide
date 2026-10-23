// The `const body = await res.json(); if (!res.ok || !body.ok) throw new
// Error(body.errors?.join(' ') || '<fallback>')` shape appeared, verbatim,
// at ~20 call sites across the admin console and /inbox — every GET load,
// every mutation (POST/PATCH/DELETE), whether or not it carries a body.
//
// Split into two functions rather than one: `parseOkJson` takes an
// already-fetched Response, so the two call sites that need to branch on
// `res.status === 401` before the generic ok-check (ModerationQueue,
// /inbox — a custom "not an authorized admin" message, not the generic
// fallback) can still do that themselves and then hand the response here.
// Everyone else just calls `fetchJson`.
export async function parseOkJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  // Not JSON: the host's own error page, when a function is cut off at
  // its time limit ("An error occurred…"), which said "Unexpected token
  // 'A'" (Sons of Israel's Read them now, Oct 22).
  const body = await res.json().catch(() => null)
  if (!body) throw new Error(res.status === 504 ? 'That took too long. Try again.' : fallbackMessage)
  if (!res.ok || !body.ok) throw new Error(body.errors?.join(' ') || fallbackMessage)
  return body as T
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const res = await fetch(url, init)
  return parseOkJson<T>(res, fallbackMessage)
}
