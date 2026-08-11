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
  // like one call from the same (y, anchorY, visible).
  it('has no memory between calls — nothing can get stuck', () => {
    let visible = true
    for (let i = 0; i < 1000; i++) visible = nextHeaderVisible(600, 500, visible)
    expect(visible).toBe(false)
    expect(nextHeaderVisible(600, 500, true)).toBe(false)
  })

  // This is what an actual scroll looks like, and it is the case the feature
  // was silently failing. A browser fires a scroll event about once a frame,
  // so a normal drag advances a handful of pixels per event. Held against a
  // FIXED anchor those pixels accumulate and the header responds after the
  // threshold's worth of travel; held against the PREVIOUS EVENT's position
  // — which is what this used to be passed — every single step sits inside
  // the slack and the header never moves at all, no matter how far you
  // scroll.
  it('accumulates ordinary small scroll steps against a fixed anchor', () => {
    const anchor = 500
    let visible = true
    let y = anchor
    // Three 3px steps: 9px of travel, one pixel past the 8px slack.
    for (let i = 0; i < 3; i++) {
      y += 3
      visible = nextHeaderVisible(y, anchor, visible)
    }
    expect(visible).toBe(false)

    // And back up, measured from a fresh anchor at the point of reversal —
    // which is what SiteHeader re-anchors to when direction flips.
    const upAnchor = y
    for (let i = 0; i < 3; i++) {
      y -= 3
      visible = nextHeaderVisible(y, upAnchor, visible)
    }
    expect(visible).toBe(true)
  })

  it('does not move until the run clears the slack', () => {
    // Two 3px steps is 6px — still inside the 8px slack, so nothing happens.
    const anchor = 500
    let visible = true
    visible = nextHeaderVisible(503, anchor, visible)
    visible = nextHeaderVisible(506, anchor, visible)
    expect(visible).toBe(true)
  })
})
