import { useEffect, useRef } from 'react'
import { track } from '@vercel/analytics'
import { logSearchMiss } from './logSearchMiss'

// Logs a zero-result search once the query settles (debounced), once per
// (source + term) per session. `ready` guards against logging while data is
// still loading — a slow load isn't a real miss. Shared by every search bar so
// the behavior (debounce, dedupe, min length) stays identical across screens;
// `source` records which screen the search happened on.
//
// Also fires a general "search" analytics event on the same debounce/dedupe,
// regardless of whether it hit — this hook is already wired into every search
// bar, so it's the one place that covers all of them without extra plumbing.
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
      if (!hasResults) logSearchMiss(query.trim(), source)
    }, 1500)
    return () => clearTimeout(timer)
  }, [query, hasResults, ready, source])
}
