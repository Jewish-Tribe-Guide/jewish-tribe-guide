'use client'

import { createContext, useContext, useLayoutEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Lets a screen tell the shared header to get out of the way for as long as
// it's mounted — currently only the mobile map, which floats its own search
// bar and controls directly over the map (Google-Maps-style) and has no use
// for the header competing for the same strip of screen.
//
// A context rather than the header deriving "am I on the map?" from the URL
// itself: SiteHeader is rendered unconditionally from the community layout and
// currently needs no Suspense boundary, so it paints with the very first
// static shell. Reading the path there would require one — see the note on
// PathAwareTabBar in SiteChrome.tsx for why that costs a beat-late render on
// every cold load — and that cost would land on every screen, not just the
// one that actually needs to know. This way only the map screen opts in.
// ─────────────────────────────────────────────────────────────────────────────

const HeaderCollapseContext = createContext<{
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
} | null>(null)

export function HeaderCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <HeaderCollapseContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </HeaderCollapseContext.Provider>
  )
}

function useHeaderCollapseContext() {
  const ctx = useContext(HeaderCollapseContext)
  if (!ctx) throw new Error('useHeaderCollapseContext must be used inside a HeaderCollapseProvider')
  return ctx
}

/** Read by SiteHeader. */
export function useHeaderCollapsed(): boolean {
  return useHeaderCollapseContext().collapsed
}

/** Called by a screen that wants the header collapsed for as long as it's
 *  mounted (pass `false` — the default — to leave the header alone). Reset
 *  happens automatically on unmount, so leaving the screen by any route,
 *  including the browser's back button, can never leave the header stuck
 *  hidden.
 *
 *  useLayoutEffect, not useEffect: on a cold load of the map screen, this
 *  fires after the very first commit either way — the header is briefly
 *  mounted *uncollapsed* no matter which one is used, since `collapsed`
 *  genuinely starts false in the provider above. The difference is whether
 *  the browser ever paints that frame. useLayoutEffect's setCollapsed(true)
 *  flushes before paint, so the visitor never sees it; useEffect's runs
 *  after, and on a slow/cold load — competing with hydration and this same
 *  screen's own data fetching — that gap is wide enough to paint. Anything
 *  reading `collapsed` at that instant (LocationControl's popover, opened by
 *  a geoError effect that can fire just as early if tracking auto-resumes
 *  into an already-blocked permission) then renders anchored to the header
 *  pill instead of the map's bottom sheet — the "opens in a different place
 *  on first load" bug this replaced. */
export function useCollapseHeader(collapse: boolean): void {
  const { setCollapsed } = useHeaderCollapseContext()
  useLayoutEffect(() => {
    if (!collapse) return
    setCollapsed(true)
    return () => setCollapsed(false)
  }, [collapse, setCollapsed])
}

/** Whether the header should be showing after a scroll to `y`, given it was
 *  last at `lastY` and was `visible` beforehand.
 *
 *  Pure so the part that actually has room for a mistake — the scroll-
 *  direction math — can be tested without simulating a browser scroll. See
 *  headerVisibility.test.ts.
 *
 *  `threshold` is slack: without it, a bounce/jitter scroll (or a
 *  fractional-pixel wheel tick that rounds one way then the other) flickers
 *  the header on every frame. Only a deliberate scroll past the slack changes
 *  anything; a scroll that stays inside it leaves the header exactly as it
 *  was. */
export function nextHeaderVisible(y: number, lastY: number, visible: boolean, threshold = 8): boolean {
  if (y <= 0) return true
  if (y > lastY + threshold) return false
  if (y < lastY - threshold) return true
  return visible
}
