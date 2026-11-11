import { describe, expect, it } from 'vitest'
import { HEIGHT, SHIFT, WIDTH, tilesFor, visiblePart, worldPixel } from './map-card-picture.mjs'

// The script makes a community's map card picture from its map centre. What
// can go wrong without anyone noticing is where the centre lands and whether
// the tiles cover the whole picture, so those are what this checks.

const philly = { lat: 39.9526, lng: -75.1652 }

describe('map card picture', () => {
  it('covers every pixel of the picture with tiles, and no pixel twice', () => {
    const parts = tilesFor(philly).map((t) => visiblePart(t))
    for (const v of parts) {
      expect(v.width).toBeGreaterThan(0)
      expect(v.height).toBeGreaterThan(0)
      expect(v.left + v.width).toBeLessThanOrEqual(WIDTH)
      expect(v.top + v.height).toBeLessThanOrEqual(HEIGHT)
    }
    for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) {
      const overlap = a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
      expect(overlap).toBe(false)
    }
    // No overlaps and every part inside, so equal areas means full cover.
    expect(parts.reduce((sum, v) => sum + v.width * v.height, 0)).toBe(WIDTH * HEIGHT)
  })

  it('puts the community’s centre right of the card’s words, halfway down', () => {
    const [t] = tilesFor(philly)
    const c = worldPixel(philly, t.z)
    const atX = c.x - (t.x * 256 - t.left)
    const atY = c.y - (t.y * 256 - t.top)
    expect(atX / WIDTH).toBeCloseTo(0.5 + SHIFT, 2)
    expect(atY / HEIGHT).toBeCloseTo(0.5, 2)
  })

  it('cuts edge tiles to the part inside the picture', () => {
    expect(visiblePart({ left: -100, top: -30 })).toEqual({ cropLeft: 100, cropTop: 30, left: 0, top: 0, width: 156, height: 226 })
    expect(visiblePart({ left: WIDTH - 56, top: HEIGHT - 200 })).toEqual({ cropLeft: 0, cropTop: 0, left: WIDTH - 56, top: HEIGHT - 200, width: 56, height: 200 })
  })
})
