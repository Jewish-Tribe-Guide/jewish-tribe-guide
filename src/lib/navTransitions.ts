'use client'

// ── Shared enter/exit config for the <ViewTransition> wrapping a screen's
// own top-level content (Landing's <main>, SlugScreen's <main>) — the
// directional slide for "one level deeper" / "back" navigation between the
// home grid and a category, matching the OS convention native apps use for
// drill-down (see globals.css's .nav-forward/.nav-back rules for the actual
// animation).
//
// Mobile only — but that gating happens at the SOURCE of each navigation
// (Card in sections.tsx, SlugScreen's own onUp), not here. This used to read
// useIsMobile() right here instead, on the theory that whether the tag
// produces an animation could be decided entirely by the destination's own
// wrapper. That's exactly what broke it: useIsMobile() is documented "not
// for anything that must be correct on the very first paint" (it starts
// false and only corrects after an effect runs), and this config is read at
// the exact moment SlugScreen/Landing mounts fresh — the very case that
// doc warns about. A forward nav landed on a freshly-mounted SlugScreen
// whose own isMobile hadn't corrected yet, so the map silently fell back to
// NO_TRANSITION_MAP and the slide never played; Landing remounts on every
// "back to home" nav, so back was wrong close to every time. The source
// components tagging transitionTypes are already-mounted and stable by the
// time a visitor actually clicks — their own useIsMobile() has long since
// corrected — so the mobile check belongs there, and this map can just be
// an unconditional constant.
const NAV_TRANSITION_MAP = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  default: 'none',
} as const

// iOS (Safari AND Chrome — Apple requires every iOS browser to run WebKit's
// engine, regardless of branding; reported live as stuck/frozen nav on both)
// hits a real, open, unfixed upstream bug — facebook/react#35336 — matching
// this exact shape: a <ViewTransition> with BOTH `enter` and `exit` set,
// wrapping a <Suspense> with a real fallback, which is exactly what
// SlugScreen's own <main> does. Not something this app's CSS or React
// version can work around from here; the ViewTransition API itself is still
// a React canary-only feature (see package.json's react/react-dom pin)
// specifically because it isn't stable yet. Omitting BOTH `enter` and `exit`
// entirely on iOS (not just mapping their values to 'none') is what actually
// avoids the trigger, per the linked issue — it's the PROPS being present at
// all that matters, not which animation the map resolves to. This disables
// the slide entirely on iOS, in both directions, falling back to the plain
// mount-triggered fadeIn every screen already has — no directional slide
// there, but a working nav.
function isIOSWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports as "Macintosh" in the UA string, indistinguishable
  // from a real Mac by string alone — maxTouchPoints is what actually tells
  // them apart (a real Mac has none).
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function useNavTransitionProps() {
  if (isIOSWebKit()) return { default: 'none' as const }
  return { enter: NAV_TRANSITION_MAP, exit: NAV_TRANSITION_MAP, default: 'none' as const }
}
