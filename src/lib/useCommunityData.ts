'use client'

import { useEffect, useState } from 'react'
import { useActiveCommunity } from './useCommunities'

// ─────────────────────────────────────────────────────────────────────────────
// Shared per-community fetch cache.
//
// Every content hook (categories, listings, home sections, site settings,
// forms, hospitals) had its own module-level `cache`/`inflight` pair. Once the
// same page can show different communities those caches have to be keyed by
// community, or switching serves the previous one's data — and six hand-copied
// implementations of that is exactly how one of them ends up not keyed.
//
// The key is `${community}:${path}`, so a switch simply misses the cache and
// fetches, and switching back is instant.
// ─────────────────────────────────────────────────────────────────────────────

const caches = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

/** Appends the active community to a data URL, preserving any existing query. */
export function withCommunity(path: string, community: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}community=${encodeURIComponent(community)}`
}

/**
 * Fetches `path` scoped to the active community and caches the result per
 * community.
 *
 * `load` receives the community-scoped URL and returns the parsed value; it
 * owns its own error handling (each caller has a different sensible fallback —
 * an empty list, a seeded default, the config settings). Returns `initial`
 * until the community is known and the first load resolves.
 */
export function useCommunityData<T>(
  path: string,
  load: (url: string) => Promise<T>,
  initial: T,
): { data: T; community: string | null } {
  const { community } = useActiveCommunity()
  const slug = community?.slug ?? null
  const key = slug ? `${slug}:${path}` : null

  const [data, setData] = useState<T>(() => (key && caches.has(key) ? (caches.get(key) as T) : initial))

  useEffect(() => {
    if (!key || !slug) return
    if (caches.has(key)) {
      // Already fetched for this community — adopt it without another request.
      // Resolved rather than set directly so this stays a post-render update.
      let active = true
      Promise.resolve(caches.get(key) as T).then((v) => {
        if (active) setData(v)
      })
      return () => {
        active = false
      }
    }

    let pending = inflight.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = load(withCommunity(path, slug))
      inflight.set(key, pending as Promise<unknown>)
    }

    let active = true
    pending.then((loaded) => {
      caches.set(key, loaded)
      inflight.delete(key)
      if (active) setData(loaded)
    })
    return () => {
      active = false
    }
    // `load` is a fresh closure each render; the key is what identifies the
    // request, so re-running on its identity would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug, path])

  return { data, community: slug }
}
