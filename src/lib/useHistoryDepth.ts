'use client'

import { useEffect, useRef } from 'react'

/**
 * A screen opened inside a page (an editor's open row, a minyan inside it,
 * a change's Edit, a source's Change) as an entry in the history, so a
 * trackpad or phone swipe back closes it instead of leaving the page under
 * it. Before this they were state only, and Back skipped them: "we go into
 * new screens and then I use the trackpad to go back and it goes back two
 * screens" (the user, Nov 2).
 *
 * `depth` is how many screens deep the page is now (0: none open). Going
 * deeper pushes an entry per level, marked `key` in history.state. Back,
 * the browser's, calls `back` once per level left; the page's own Back
 * calls `back` as before, and this takes the entry off with it. Hosts that
 * nest (a change opened over a place's editor) each use their own key.
 */
export function useHistoryDepth(key: string, depth: number, back: () => void) {
  KEYS.add(key)
  const now = useRef({ depth, back })
  useEffect(() => {
    now.current = { depth, back }
  })

  const first = useRef(true)
  useEffect(() => {
    const marked = depthIn(window.history.state, key)
    if (depth > marked) {
      for (let d = marked + 1; d <= depth; d++) window.history.pushState({ ...(window.history.state ?? {}), [key]: d }, '')
    } else if (depth < marked) {
      // Arriving on an entry left behind (a save that went on elsewhere):
      // it's this page now, not a screen to step out of.
      if (first.current) window.history.replaceState({ ...window.history.state, [key]: depth }, '')
      else window.history.go(depth - marked)
    }
    first.current = false
  }, [key, depth])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const to = depthIn(e.state, key)
      if (now.current.depth > to) now.current.back()
      // Forward onto a screen that was closed: nothing says which row was
      // open, so it can't be opened again. Left there, the page sat on an
      // entry claiming a screen, and its own Back (screensOpenIn) stepped
      // over one entry too many (the user, Nov 4: "not sure forward is
      // working"). It goes straight back, so Forward does nothing.
      else if (to > now.current.depth) window.history.go(now.current.depth - to)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [key])
}

const KEYS = new Set<string>()

function depthIn(state: unknown, key: string): number {
  const d = (state as Record<string, unknown> | null)?.[key]
  return typeof d === 'number' ? d : 0
}

/** How many entries screens inside the page have added on top of it, for a
 *  page leaving by history.back(): it steps over them too, or it lands on
 *  its own last screen instead of the list behind it. */
export function screensOpenIn(state: unknown): number {
  let n = 0
  for (const key of KEYS) n += depthIn(state, key)
  return n
}
