// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPin, type MapPoint } from './ResourceMap'

// ─────────────────────────────────────────────────────────────────────────────
// A place's pin, built with Google's current PinElement (Nov 18, review item
// 47). It used `glyph` and `.element`, both deprecated, and Google warned
// about them in the console on every map load. This fake is the current
// PinElement as far as a pin uses it: an element itself, with `glyphText`
// and `glyphSrc`; touching either deprecated part fails the test.
// ─────────────────────────────────────────────────────────────────────────────

const made: Record<string, unknown>[] = []

class FakePin extends HTMLElement {
  constructor(options: Record<string, unknown>) {
    super()
    if ('glyph' in options) throw new Error('PinElement `glyph` is deprecated: use glyphText or glyphSrc')
    made.push(options)
  }
  get element(): HTMLElement {
    throw new Error('PinElement.element is deprecated: use the PinElement itself')
  }
}
if (!customElements.get('fake-place-pin')) customElements.define('fake-place-pin', FakePin)

beforeEach(() => {
  made.length = 0
  ;(globalThis as unknown as { google: unknown }).google = { maps: { marker: { PinElement: FakePin } } }
})

const point = (overrides: Partial<MapPoint> = {}): MapPoint => ({ id: 'p1', lat: 40, lng: -75, name: 'Acme', color: '#16a34a', filterId: 'grocery', ...overrides })

/** The SVG a glyphSrc data URL draws. */
const svgOf = (src: unknown) => decodeURIComponent(String(src).replace(/^data:image\/svg\+xml,/, ''))

describe('buildPin', () => {
  it('draws a place’s line icon as a white SVG image, and is the pin itself', () => {
    const pin = buildPin(point(), false)

    expect(pin).toBeInstanceOf(FakePin)
    expect(made).toHaveLength(1)
    const [options] = made
    expect(options).toMatchObject({ background: '#16a34a', borderColor: '#ffffff', scale: 1 })
    expect(options.glyphText).toBeUndefined()
    expect(String(options.glyphSrc)).toMatch(/^data:image\/svg\+xml,/)
    const svg = svgOf(options.glyphSrc)
    // An image has to say it's SVG and colour itself: glyphColor can't reach it.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toMatch(/<svg[^>]*>.+<\/svg>$/)
  })

  // Item 68 (Nov 22): by the category's kind, the key the map hands it.
  it('draws the icon its glyph key names, not its address', () => {
    buildPin(point({ filterId: 'medical' }), false, 'hospital')
    expect(made[0]).toMatchObject({ glyphText: 'H' })
  })

  it('draws a hospital’s "H" as text in white', () => {
    buildPin(point({ filterId: '__hospitals__' }), false)

    expect(made[0]).toMatchObject({ glyphText: 'H', glyphColor: '#ffffff' })
    expect(made[0].glyphSrc).toBeUndefined()
  })

  it('wraps the picked place’s pin, bigger, with its halo', () => {
    const wrap = buildPin(point(), true)

    expect(made[0].scale).toBe(1.6)
    expect(wrap).not.toBeInstanceOf(FakePin)
    expect(wrap.querySelector('fake-place-pin')).not.toBeNull()
  })

  it('wraps a saved place’s pin with its badge', () => {
    const wrap = buildPin(point({ pinned: true }), false)

    expect(wrap.querySelector('fake-place-pin')).not.toBeNull()
    expect(wrap.querySelectorAll('svg')).toHaveLength(1)
  })
})
