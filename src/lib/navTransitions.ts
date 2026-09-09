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

export function useNavTransitionProps() {
  return { enter: NAV_TRANSITION_MAP, exit: NAV_TRANSITION_MAP, default: 'none' as const }
}
