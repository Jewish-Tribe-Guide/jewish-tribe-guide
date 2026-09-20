// ─────────────────────────────────────────────────────────────────────────────
// A tiny in-process cache for the proxy's "which communities are hidden" read.
//
// The proxy runs on nearly every request, so this can't be a query per request
// — it's one per TTL window. Three things it does that a bare
// `if (expired) refetch` doesn't:
//
//   • Shares one in-flight load between concurrent callers. Without that, every
//     request arriving after the window expires fires its own query.
//   • On a failed refresh, keeps serving the LAST GOOD data rather than
//     replacing it with an empty answer. An empty answer means "no community
//     is hidden", so a single failed query used to make every hidden community
//     publicly readable for the whole window — exactly when the database is
//     having a bad time.
//   • Retries after a short delay instead of waiting out the whole TTL, so a
//     blip heals in seconds.
//
// What it cannot fix: a process that has never loaded anything and can't reach
// the database has no idea what's hidden. It answers `{}` (fail open) — the
// deliberate, pre-existing trade-off, because failing closed would take the
// whole site down on, say, a preview deployment with missing env vars.
// ─────────────────────────────────────────────────────────────────────────────

export function createVisibilityLoader<T>(opts: {
  load: () => Promise<T>
  /** What to answer when nothing has ever loaded. */
  empty: T
  ttlMs: number
  retryMs: number
  now?: () => number
  onError?: (err: unknown) => void
}): () => Promise<T> {
  const { load, empty, ttlMs, retryMs, onError } = opts
  const now = opts.now ?? Date.now

  let data: T | null = null
  let expiresAt = 0
  let inFlight: Promise<void> | null = null

  async function refresh(): Promise<void> {
    try {
      // `load` may throw synchronously (getAdminClient does on a missing env
      // var); the await inside try catches that too.
      data = await load()
      expiresAt = now() + ttlMs
    } catch (err) {
      expiresAt = now() + retryMs
      onError?.(err)
    } finally {
      inFlight = null
    }
  }

  return async () => {
    if (now() >= expiresAt) {
      inFlight ??= refresh()
      await inFlight
    }
    return data ?? empty
  }
}
