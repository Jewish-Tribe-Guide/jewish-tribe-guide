'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

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

// ─────────────────────────────────────────────────────────────────────────────
// Lets a screen hand the shared header its own title + "up" handler, so on
// mobile the header can show "‹ {category name}" in place of the static site
// name/logo — the same drill-down pattern most native apps use (cRc Kosher's
// own app being the one that prompted this). Desktop keeps the existing
// Breadcrumb ("{upLabel} / {title}") instead, since there's already room for
// both the site chrome and the destination there; this context is read by
// SiteHeader but only acted on for mobile widths.
//
// Same shape as HeaderCollapseContext just above, for the same reasons: a
// context rather than SiteHeader deriving "am I on a category?" from the URL
// (see that block's own doc), and no-op default values (rather than throwing
// when there's no provider) so this stays safe in CategoryPreview, which
// stacks its own HeaderCollapseProvider but has no reason to also carry this
// one — a category preview has no "up" screen to go back to anyway.
// ─────────────────────────────────────────────────────────────────────────────

type ScreenHeaderState = { title: string; onBack: () => void } | null

const ScreenHeaderContext = createContext<{
  screenHeader: ScreenHeaderState
  setScreenHeader: (v: ScreenHeaderState) => void
}>({ screenHeader: null, setScreenHeader: () => {} })

export function ScreenHeaderProvider({ children }: { children: React.ReactNode }) {
  const [screenHeader, setScreenHeader] = useState<ScreenHeaderState>(null)
  return (
    <ScreenHeaderContext.Provider value={{ screenHeader, setScreenHeader }}>
      {children}
    </ScreenHeaderContext.Provider>
  )
}

/** Read by SiteHeader. */
export function useScreenHeader(): ScreenHeaderState {
  return useContext(ScreenHeaderContext).screenHeader
}

/** Called by a screen that wants the header to show its own title in place of
 *  the site name (pass `active: false` to leave the header alone — simplest
 *  for a caller that's conditionally a "top-level" screen rather than always
 *  wrapping this in its own `if`). Reset happens automatically on unmount or
 *  when `active` goes false, same guarantee as `useCollapseHeader`: leaving by
 *  any route, including the browser's back button, can never leave the
 *  header stuck showing a stale title.
 *
 *  `onBack` is read through a ref rather than listed as an effect dependency —
 *  callers typically hand this a fresh closure (e.g. `goHome` from
 *  useSiteNavigation) every render, and depending on it directly would re-run
 *  the effect, and therefore re-render the header's context, on every render
 *  of the calling screen instead of only when the title actually changes. */
export function useSetScreenHeader(active: boolean, title: string, onBack: () => void): void {
  const { setScreenHeader } = useContext(ScreenHeaderContext)
  const onBackRef = useRef(onBack)
  // Keeps the ref current without writing to it during render (React's
  // react-hooks/refs rule — a render is allowed to run more than once, or be
  // thrown away, before it commits, so a write here has to happen in an
  // effect instead). No dependency array: this needs to run after EVERY
  // render, not just when `onBack` changes, since `current` has to reflect
  // whatever the LATEST render's closure was by the time anything reads it.
  useLayoutEffect(() => {
    onBackRef.current = onBack
  })

  useLayoutEffect(() => {
    if (!active) return
    setScreenHeader({ title, onBack: () => onBackRef.current() })
    return () => setScreenHeader(null)
  }, [active, title, setScreenHeader])
}

/** Whether the header should be showing after a scroll to `y`, given the
 *  current run of scrolling began at `anchorY` and it was `visible` before.
 *
 *  `anchorY` is where the visitor last reversed direction — deliberately NOT
 *  the position at the previous scroll event. A browser fires scroll events
 *  roughly per frame, so an ordinary drag moves single-digit pixels per
 *  event; measured event-to-event, the slack below is essentially never
 *  cleared and the header only reacts to a hard flick. Measured from the
 *  start of the run, `threshold` means what it reads like: how far you have
 *  to scroll one way before the header responds. SiteHeader owns tracking
 *  the anchor, since that needs memory and this deliberately has none.
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
export function nextHeaderVisible(y: number, anchorY: number, visible: boolean, threshold = 8): boolean {
  if (y <= 0) return true
  if (y > anchorY + threshold) return false
  if (y < anchorY - threshold) return true
  return visible
}

/** The hide-on-scroll-down/reveal-on-scroll-up behavior above, generalized
 *  for any pinned strip that wants it — not just SiteHeader, which now just
 *  calls this instead of running its own copy of the same effect. `enabled`
 *  lets a caller gate the behavior on its own condition (SiteHeader used to
 *  inline this as "no listener needed on desktop"); when it's false this
 *  always returns true and tears down any existing listener, so a caller
 *  never has to separately reset state when its own condition flips off.
 *
 *  Kept in this file (not a new one) since it's the same scroll-anchor
 *  mechanism `nextHeaderVisible` implements, just wired to a live listener —
 *  splitting the pure math from the effect is what let this be reused at all. */
export function useScrollShowHide(enabled: boolean): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!enabled) return

    let lastY = window.scrollY
    let anchorY = lastY
    let goingDown = true

    function onScroll() {
      const y = window.scrollY
      if (y !== lastY) {
        const down = y > lastY
        if (down !== goingDown) {
          goingDown = down
          anchorY = lastY
        }
        lastY = y
      }
      const anchor = anchorY
      setVisible((prev) => nextHeaderVisible(y, anchor, prev))
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])

  return !enabled || visible
}
