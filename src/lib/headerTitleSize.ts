// ─────────────────────────────────────────────────────────────────────────────
// How big a title is in the phone header (Nov 16, the user: the titles were
// too small next to an app like Spotify; "be aware of long names").
//
// 22px bold when it fits, stepping down to 15px (then two lines) before it is
// cut off. The room a title gets depends on the phone and on what sits
// beside it (127px on a 320px phone next to "Set location"), so FitTitle
// measures it; this is only its first guess, from the length, so the server
// draws something close and the step after it is small or none.
// The computer header has its own size and ignores both.
// ─────────────────────────────────────────────────────────────────────────────

export const TITLE_STEPS = [22, 19, 17, 15] as const

export function headerTitleSize(text: string): number {
  if (text.length <= 12) return 22
  if (text.length <= 18) return 19
  if (text.length <= 22) return 17
  return 15
}

/** The biggest step at which the title fits, asked by `fits` (which sets
 *  the size and measures); the smallest when none does. */
export function fitTitleSize(fits: (px: number) => boolean): number {
  for (const px of TITLE_STEPS) if (fits(px)) return px
  return TITLE_STEPS[TITLE_STEPS.length - 1]
}
