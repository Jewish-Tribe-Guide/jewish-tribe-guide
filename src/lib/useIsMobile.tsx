'use client'

import { createContext, useContext, useEffect, useState } from 'react'

// When set, `useIsMobile` returns this instead of measuring the window. Only
// the admin's device preview provides it — see the note in useIsMobile below
// for why measuring is wrong in that one place.
const ForcedViewportContext = createContext<boolean | null>(null)

/** Forces every `useIsMobile()` inside `children` to report a fixed answer.
 *  Used by the admin device preview, whose content is portaled into an iframe:
 *  the iframe gives its markup a real 390px/1280px viewport (so Tailwind's
 *  `sm:` rules resolve correctly), but the React tree still *executes* in the
 *  admin window's JS realm — so `window.matchMedia` there measures the admin's
 *  browser, not the frame. Without this, every `isMobile`-driven branch
 *  (the featured row, the zmanim band, whether the card grid shows inline)
 *  renders for the admin's screen while the CSS around it renders for the
 *  selected device, and the Desktop/Mobile toggle silently means nothing. */
export function ForcedViewport({ isMobile, children }: { isMobile: boolean; children: React.ReactNode }) {
  return <ForcedViewportContext.Provider value={isMobile}>{children}</ForcedViewportContext.Provider>
}

// Reports whether the viewport is phone-sized. SSR-safe: starts false (desktop)
// so server and first client render agree, then updates after mount. Use for
// small presentational tweaks like shorter placeholder text — not for anything
// that must be correct on the very first paint.
//
// Mobile means width OR height is small (matches globals.css's `desktop:`
// variant, which requires BOTH to be roomy) — not just width alone. A phone
// rotated to landscape is often 700-950px wide, well past a plain
// `max-width: 640px` check, but its short side is still only ~375-430px; a
// width-only query would call that "desktop" the instant the phone turns
// sideways. Keep this in sync with globals.css's `@custom-variant desktop`.
export function useIsMobile(query = '(max-width: 639px), (max-height: 639px)'): boolean {
  const forced = useContext(ForcedViewportContext)
  const [isMobile, setIsMobile] = useState(false)

  // Runs unconditionally even when forced — hooks can't be skipped, and the
  // listener is harmless when its result is overridden below.
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return forced ?? isMobile
}
