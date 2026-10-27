import { useEffect } from 'react'
import { learnFrom } from './askReader'

// A search that finds nothing is read in the background (learnFrom) once
// the typing stops, not only on Enter, which most people never press (the
// user, Oct 27). The pause is longer than the old live reader's one second,
// which read about 15 half-typed words in 41: a reading costs an AI call,
// and a word still being typed is no question. `ready` holds it while the
// page's data is loading, when everything finds nothing.
export const LEARN_PAUSE_MS = 2500

export function useLearnAfterPause({
  query,
  foundNothing,
  ready,
  community,
}: {
  query: string
  foundNothing: boolean
  ready: boolean
  community: string | null
}): void {
  useEffect(() => {
    if (!ready || !foundNothing || query.trim().length < 2) return
    const timer = setTimeout(() => learnFrom(query, community), LEARN_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [query, foundNothing, ready, community])
}
