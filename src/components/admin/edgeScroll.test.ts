import { describe, expect, it } from 'vitest'
import { edgeScroll } from './DragList'

// The user, Nov 10: "The screen didn't drag down as I was moving the field
// down". The page itself scrolling is proved in e2e-admin-write/drag.spec.ts;
// this is when it does.
describe('edgeScroll', () => {
  it('scrolls near the edge the row is taken toward, faster nearer it', () => {
    expect(edgeScroll(400, 800, 300)).toBe(0)
    expect(edgeScroll(780, 800, 300)).toBeGreaterThan(edgeScroll(720, 800, 300))
    expect(edgeScroll(720, 800, 300)).toBeGreaterThan(0)
    expect(edgeScroll(10, 800, 300)).toBeLessThan(0)
  })

  it('doesn’t scroll for a row lifted near an edge and taken the other way', () => {
    expect(edgeScroll(760, 800, 780)).toBe(0)
    expect(edgeScroll(30, 800, 10)).toBe(0)
  })
})
