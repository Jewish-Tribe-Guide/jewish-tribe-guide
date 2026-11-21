import { useEffect, useRef, useState } from 'react'

// Whether the category page's controls bar is docked under the header (its
// sticky position engaged), for its docked look (GenericDirectory).

export function useControlsStuck(isMobile: boolean) {
  // Whether the controls bar is currently actually pinned against content
  // scrolling underneath it, vs. still sitting inline before you've scrolled
  // to it — a plain `window.innerWidth`/breakpoint check can't tell the two
  // apart, only "has this specific element's own sticky position engaged."
  // Drives the border/shadow below: without it, a border on an element still
  // in normal flow reads as a stray line floating in whitespace rather than
  // a bar visibly docked against the cards below it.
  //
  // A sentinel + IntersectionObserver, not the `position === 'sticky'` check
  // scrollItemIntoView uses above: that one is read imperatively at the
  // moment of a click, which is fine for a one-off measurement, but this
  // needs to re-render whenever stuck-ness actually changes — polling
  // getComputedStyle on every scroll frame just to catch that would be far
  // more work for the same answer an observer gives you for free.
  //
  // Re-run on crossing the phone/computer line (isMobile): that remounts
  // the sentinel (CategoryBandFrame wraps the list only on a computer), and
  // an observer left on the old, detached node read top 0, "stuck", so the
  // bar kept its docked white box on an unscrolled page (the user, Nov 17:
  // desktop → phone → desktop). Keyed on isMobile, not a callback ref held
  // as state: that cost a second render on every load. And not watched at
  // all on a phone, where the docked look is never drawn: there each change
  // re-rendered the page under an open sheet, and a shul's sheet opened from
  // its address lost its Edit button mid-test (one-sheet.spec, 2 runs in 15).
  const controlsSentinelRef = useRef<HTMLDivElement>(null)
  const [controlsStuck, setControlsStuck] = useState(false)
  useEffect(() => {
    const sentinel = controlsSentinelRef.current
    if (!sentinel || isMobile) return
    // rootMargin's top matches `lg:top-14` (56px) below — the sentinel sits
    // in normal flow immediately above the controls bar, so it stops
    // "intersecting" at exactly the scroll position where the bar's own
    // sticky offset would engage, not a moment before or after.
    function makeObserver() {
      const observer = new IntersectionObserver(([entry]) => setControlsStuck(!entry.isIntersecting), {
        threshold: 0,
        rootMargin: '-56px 0px 0px 0px',
      })
      observer.observe(sentinel!)
      return observer
    }
    let observer = makeObserver()
    // Resyncing by replacing the observer alone (disconnect + a fresh
    // `makeObserver()`) isn't enough: confirmed by hand, in real browser
    // testing, that even a BRAND NEW IntersectionObserver's very first
    // callback can misreport — this isn't limited to the original,
    // mount-time instance. IntersectionObserver's callback is asynchronous
    // by spec (scheduled some time "after layout and paint"), and nothing
    // guarantees that delivery race resolves correctly on every instance,
    // every time. `getBoundingClientRect()` has no such race — it's a
    // synchronous, always-current measurement — so `resync` sets
    // `controlsStuck` directly from it. The observer is still replaced
    // alongside that (cheap, and worth doing so a later plain scroll isn't
    // still checking a sentinel bound to a stale rootMargin/layout
    // snapshot), just no longer trusted to deliver the correction itself.
    function resync() {
      setControlsStuck(sentinel!.getBoundingClientRect().top < 56)
      observer.disconnect()
      observer = makeObserver()
    }
    // Two separate races this bar's "docked" look (white background, the
    // border, the shadow — all `lg:`-gated on `controlsStuck`) can lose,
    // both confirmed by hand and both invisible on their own since neither
    // has any effect below the `lg:` breakpoint:
    //
    // Mount: this component's very first observation can land against a
    // not-yet-settled layout — content above the sentinel still streaming
    // or hydrating in — and, once wrong, does NOT self-correct from a later
    // legitimate layout shift, even long after that content has finished
    // loading. `load` (or immediately, via a double rAF, if it already
    // fired before this effect ran) is the resync point: a real signal that
    // layout has settled, not a guessed timeout.
    //
    // Resize: rotating a device, or crossing the `lg:` breakpoint by
    // resizing a browser window, reshuffles the whole page above the
    // sentinel — the mobile address banner disappears, the desktop hero/
    // badge appear. Debounced to the quiet period after the last event in a
    // resize burst so it resyncs against the settled size once, not a
    // different mid-transition layout on every intermediate event.
    if (document.readyState === 'complete') {
      requestAnimationFrame(() => requestAnimationFrame(resync))
    } else {
      window.addEventListener('load', resync, { once: true })
    }
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    function handleResize() {
      if (resizeTimer != null) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        resync()
      }, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('load', resync)
      if (resizeTimer != null) clearTimeout(resizeTimer)
      observer.disconnect()
    }
  }, [isMobile])
  return { controlsSentinelRef, controlsStuck }
}
