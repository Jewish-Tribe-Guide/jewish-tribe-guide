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

describe('PreviewBeside showing the whole page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  // The box on the page the shrunk frame sits in.
  function shown() {
    return screen.getByTitle('Preview').parentElement!.parentElement!
  }
  function pageIs(height: number) {
    const doc = screen.getByTitle('Preview').closest('iframe')!.contentDocument!
    doc.body.getBoundingClientRect = () => ({ height }) as DOMRect
    act(() => {
      vi.advanceTimersByTime(400)
    })
    return doc
  }

  it('is as tall as the page, all of it', () => {
    render(<PreviewBeside src="about:blank" wholePage />)
    // 1,740 of 1,280 wide, shown 340 wide.
    pageIs(1740)
    expect(shown().style.height).toBe('462px')
  })

  it('tells the page its body needn’t fill the frame, so it can get shorter', () => {
    render(<PreviewBeside src="about:blank" wholePage />)
    const doc = pageIs(1740)
    expect(doc.getElementById('preview-fit-style')?.textContent).toContain('min-height: 0')
  })

  it('is one screen when the page is shorter than one', () => {
    render(<PreviewBeside src="about:blank" wholePage />)
    pageIs(600)
    expect(shown().style.height).toBe('292px')
  })

  it('is one screen without wholePage', () => {
    render(<PreviewBeside src="about:blank" />)
    pageIs(1740)
    expect(shown().style.height).toBe('292px')
  })
})
