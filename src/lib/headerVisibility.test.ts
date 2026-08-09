import { describe, expect, it } from 'vitest'
import { nextHeaderVisible } from './headerVisibility'

// The scroll-direction decision is the one part of the hide-on-scroll header
// with room for a real mistake, and simulating a browser scroll to exercise it
// is slow and flaky (a touch/wheel gesture isn't reproducible the way a
// function call is). Tested directly instead.

describe('nextHeaderVisible', () => {
  it('is always visible at the very top, regardless of direction', () => {
    expect(nextHeaderVisible(0, 500, false)).toBe(true)
    expect(nextHeaderVisible(0, 0, false)).toBe(true)
  })

  it('hides once scrolled down past the slack', () => {
    expect(nextHeaderVisible(100, 50, true)).toBe(false)
  })

  it('reveals once scrolled up past the slack, even while far down the page', () => {
    expect(nextHeaderVisible(900, 950, false)).toBe(true)
  })

  it('ignores a scroll that stays inside the slack band, either direction', () => {
    // Default threshold is 8.
    expect(nextHeaderVisible(505, 500, true)).toBe(true)
    expect(nextHeaderVisible(495, 500, true)).toBe(true)
    expect(nextHeaderVisible(505, 500, false)).toBe(false)
  })

  it('treats the threshold as inclusive — exactly at it is still a jitter, not a scroll', () => {
    expect(nextHeaderVisible(508, 500, true)).toBe(true)
    expect(nextHeaderVisible(492, 500, false)).toBe(false)
  })

  it('changes the instant a scroll clears the threshold', () => {
    expect(nextHeaderVisible(509, 500, true)).toBe(false)
    expect(nextHeaderVisible(491, 500, false)).toBe(true)
  })

  it('honours a custom threshold', () => {
    expect(nextHeaderVisible(520, 500, true, 30)).toBe(true)
    expect(nextHeaderVisible(531, 500, true, 30)).toBe(false)
  })

  // The scenario this whole rewrite exists for: a stuck rAF/ticking flag used
  // to mean a scroll event landing after one was silently dropped. This
  // function has no such state at all — every call is independent, so nothing
  // can get "stuck". A long run of consecutive calls should behave exactly
  // like one call from the same (y, lastY, visible).
  it('has no memory between calls — nothing can get stuck', () => {
    // A thousand individual 1px down-steps, each one well inside the slack on
    // its own — a fired scroll-event-per-pixel would be unusual, but this is
    // the actual worst case a stuck rAF/ticking flag used to guard against.
    let y = 500
    let visible = true
    for (let i = 0; i < 1000; i++) {
      visible = nextHeaderVisible(y + 1, y, visible)
      y += 1
    }
    // 1000 individually-tiny steps never crosses the threshold, so the header
    // never moves — even though the total distance covered (1000px) very much
    // would have, had it happened as one jump.
    expect(visible).toBe(true)

    // The equivalent single jump does cross it.
    expect(nextHeaderVisible(1500, 500, true)).toBe(false)
  })
})
