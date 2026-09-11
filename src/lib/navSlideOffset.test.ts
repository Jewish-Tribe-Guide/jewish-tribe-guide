import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The mobile home<->category slide (globals.css's .nav-forward/.nav-back
// rules, plus Landing's .reveal-slide-back stand-in — see navTransitions.ts)
// used to move by a fixed 60px. Reported live (a screenshot mid-transition):
// on a ~375-430px phone that's only ~15% of the screen, so while old and new
// cross-fade via opacity at the same time (a deliberate choice — see the
// blank-flash note in globals.css), the two were still sitting almost fully
// on top of each other for most of the 400ms slide — home's hero/search
// visibly overlapping a category's filter bar and listing cards, since
// unlike a real OS drill-down these two screens share no structure a viewer
// could read as "the same content, nudged." The fix moved every
// --slide-offset in this block to ±100% (of the transitioning box's own
// width), a real push instead of a nudge. Asserted from source because a
// regression back to a small px value wouldn't fail any layout assertion —
// only a live device screenshot mid-animation ever caught it, and that isn't
// something CI can reproduce on demand.
const CSS = readFileSync('src/app/globals.css', 'utf-8')

function block(startMarker: string): string {
  const start = CSS.indexOf(startMarker)
  if (start === -1) throw new Error(`marker not found: ${startMarker}`)
  const end = CSS.indexOf('@keyframes slide', start)
  return CSS.slice(start, end)
}

describe('the mobile slide transition pushes screens fully off/on frame', () => {
  it('every --slide-offset between the root-crossfade fix and the slide keyframes is a full ±100%, not a small px nudge', () => {
    const nav = block('::view-transition-old(.nav-forward)')
    const offsets = [...nav.matchAll(/--slide-offset:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(offsets.length).toBeGreaterThan(0)
    for (const offset of offsets) {
      expect(offset, `found a --slide-offset of ${offset} — should be ±100%, not a small fixed px value`).toMatch(/^-?100%$/)
    }
  })

  it('.reveal-slide-back (Landing’s stand-in for ::view-transition-new(.nav-back)) matches', () => {
    const reveal = CSS.slice(CSS.indexOf('.reveal-slide-back {'), CSS.indexOf('@keyframes slide'))
    expect(reveal).toMatch(/--slide-offset:\s*-100%;/)
  })
})
