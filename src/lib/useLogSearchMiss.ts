import { useEffect, useRef } from 'react'
import { track } from '@vercel/analytics'

// Fires a "search" analytics event once the query settles (debounced), once
// per (source + term) per session — `hasResults` distinguishes a hit from a
// miss. `ready` guards against firing while data is still loading — a slow
// load isn't a real miss. Shared by every search bar so the behavior
// (debounce, dedupe, min length) stays identical across screens; `source`
// records which screen the search happened on.
export function useLogSearchMiss({
  query,
  hasResults,
  ready,
  source,
}: {
  query: string
  hasResults: boolean
  ready: boolean
  source: string
}): void {
  const logged = useRef<Set<string>>(new Set())
  useEffect(() => {
    const term = query.trim().toLowerCase()
    if (!ready || term.length < 3) return
    const key = `${source}|${term}`
    if (logged.current.has(key)) return
    const timer = setTimeout(() => {
      logged.current.add(key)
      track('search', { source, hasResults })
    }, 1500)
    return () => clearTimeout(timer)
  }, [query, hasResults, ready, source])
}
