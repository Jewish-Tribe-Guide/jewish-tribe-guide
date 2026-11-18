import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '@/lib/adminApi'
import { parseOkJson } from '@/lib/fetchJson'
import type { PageEverywhere } from '@/lib/readyMade'

// Every community's listing pages, for the ready-made lists. Loaded once a
// visit: they change when an admin somewhere makes or edits a page, and a
// list a few minutes old offers the same fields.
let loaded: PageEverywhere[] | null = null

export function useReadyMade(token: string, community: string): { pages: PageEverywhere[] | null; error: string | null } {
  const [pages, setPages] = useState<PageEverywhere[] | null>(loaded)
  const [error, setError] = useState<string | null>(null)
  const api = useMemo(() => adminApi(token, community), [token, community])
  useEffect(() => {
    if (loaded) return
    let cancelled = false
    api
      .fetch('/api/admin/ready-made')
      .then((res) => parseOkJson<{ pages: PageEverywhere[] }>(res, 'Could not load the ready-made pages.'))
      .then((body) => {
        loaded = body.pages
        if (!cancelled) setPages(body.pages)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the ready-made pages.')
      })
    return () => {
      cancelled = true
    }
  }, [api])
  return { pages, error }
}

/** Forgets the loaded pages, for tests. */
export function forgetReadyMade() {
  loaded = null
}
