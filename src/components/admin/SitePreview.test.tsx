// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewBeside } from './SitePreview'

// jsdom lays nothing out, so a part's height is said by hand.
function addPart(doc: Document) {
  const el = doc.createElement('div')
  el.setAttribute('data-spot', 'cards')
  el.getBoundingClientRect = () => ({ height: 40, top: 0 }) as DOMRect
  doc.body.append(el)
  return el
}

describe('PreviewBeside lighting a part', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  function frameDoc() {
    const doc = screen.getByTitle('Preview').closest('iframe')!.contentDocument!
    doc.defaultView!.scrollTo = vi.fn()
    return doc
  }

  it('says the part is not on this version when it shows for a moment and goes', () => {
    const { rerender } = render(<PreviewBeside src="about:blank" />)
    const part = addPart(frameDoc())
    rerender(<PreviewBeside src="about:blank" spot="cards" />)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(part.hasAttribute('data-spot-lit')).toBe(true)
    part.remove()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText('Not on the computer version.')).toBeTruthy()
  })

  it('says nothing when the part stays', () => {
    const { rerender } = render(<PreviewBeside src="about:blank" />)
    addPart(frameDoc())
    rerender(<PreviewBeside src="about:blank" spot="cards" />)
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Not on the computer version.')).toBeNull()
  })
})
