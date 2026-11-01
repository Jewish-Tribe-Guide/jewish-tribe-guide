// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lightSpot } from './previewSpot'

// jsdom lays nothing out, so "showing" is said by hand. That a real page's
// parts are found, on the device they're on, is e2e-admin-write's job.
function part(spots: string, showing = true) {
  const el = document.createElement('div')
  el.setAttribute('data-spot', spots)
  el.getBoundingClientRect = () => ({ height: showing ? 40 : 0 }) as DOMRect
  el.scrollIntoView = vi.fn()
  document.body.append(el)
  return el
}

describe('lightSpot', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('lights the named part, one of several names, and brings it into view', () => {
    const el = part('cards card-browse')
    expect(lightSpot(document, 'card-browse')).toBe(true)
    expect(el.hasAttribute('data-spot-lit')).toBe(true)
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    // It would scroll the settings around the frame too.
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })

  it('lights every part of that name, scrolling once', () => {
    const first = part('cards card-browse')
    const second = part('cards card-subscribe')
    lightSpot(document, 'cards')
    expect([first, second].map((e) => e.hasAttribute('data-spot-lit'))).toEqual([true, true])
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('moves the light, and takes it away', () => {
    const top = part('top')
    const cards = part('cards')
    lightSpot(document, 'top')
    lightSpot(document, 'cards')
    expect(top.hasAttribute('data-spot-lit')).toBe(false)
    expect(cards.hasAttribute('data-spot-lit')).toBe(true)
    expect(lightSpot(document, null)).toBe(true)
    expect(cards.hasAttribute('data-spot-lit')).toBe(false)
  })

  it('skips the copy hidden on this device, and says when none shows', () => {
    const hidden = part('top', false)
    expect(lightSpot(document, 'top')).toBe(false)
    expect(hidden.hasAttribute('data-spot-lit')).toBe(false)
    const shown = part('top')
    expect(lightSpot(document, 'top')).toBe(true)
    expect(shown.hasAttribute('data-spot-lit')).toBe(true)
  })

  it('adds its style once', () => {
    part('top')
    lightSpot(document, 'top')
    lightSpot(document, 'top')
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
  })
})
