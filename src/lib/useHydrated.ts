'use client'

import { useSyncExternalStore } from 'react'

// False during the server render and the hydration render that has to match
// it, true from then on. For content that depends on the visitor's own
// clock or browser, which a page built ahead of time can't know: rendering
// it on the server would be wrong, and would disagree with the first
// render in the browser (a hydration error).
const subscribe = () => () => {}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
