'use client'

import { useIsMobile } from './useIsMobile'

// ── Shared enter/exit config for the <ViewTransition> wrapping a screen's
// own top-level content (Landing's <main>, SlugScreen's <main>) — the
// directional slide for "one level deeper" / "back" navigation between the
// home grid and a category, matching the OS convention native apps use for
// drill-down (see globals.css's .nav-forward/.nav-back rules for the actual
// animation).
//
// Mobile only. Desktop's own screens are plain fades with no edge the
// content is conceptually anchored to — sliding from a side there would be
// directional motion with nothing spatial backing it up (see the app's own
// motion-philosophy discussion: a slide should communicate real hierarchy,
// not decorate an otherwise flat layout change). Gating here, once, rather
// than at every `transitionTypes={['nav-forward']}` call site (Card/
// CompactCard, GenericDirectory's back arrow) — those can tag every
// navigation unconditionally, since whether the tag actually produces an
// animation is decided entirely by the destination's own wrapper.
const NAV_TRANSITION_MAP = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  default: 'none',
} as const

const NO_TRANSITION_MAP = { default: 'none' } as const

export function useNavTransitionProps() {
  const isMobile = useIsMobile()
  const map = isMobile ? NAV_TRANSITION_MAP : NO_TRANSITION_MAP
  return { enter: map, exit: map, default: 'none' as const }
}
