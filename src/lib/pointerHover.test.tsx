// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { pointerHover } from './pointerHover'

// The user, Oct 16: the map's pins popped up all down the list while
// scrolling it. What the browser does on a scroll (a row sliding under a
// still pointer) is the browser's, so here: what each kind of event does.
describe('pointerHover', () => {
  afterEach(cleanup)
  const row = () => {
    const on = vi.fn()
    const off = vi.fn()
    render(<div {...pointerHover(on, off)}>row</div>)
    return { el: screen.getByText('row'), on, off }
  }

  it('lifts when the pointer moves onto the row', () => {
    const { el, on } = row()
    fireEvent.mouseMove(el, { movementX: 4, movementY: 1 })
    expect(on).toHaveBeenCalledTimes(1)
  })

  it('does not lift for a row scrolled under a pointer standing still', () => {
    const { el, on } = row()
    fireEvent.mouseEnter(el)
    fireEvent.mouseOver(el)
    fireEvent.mouseMove(el, { movementX: 0, movementY: 0 })
    expect(on).not.toHaveBeenCalled()
  })

  it('lets go on leaving', () => {
    const { el, off } = row()
    fireEvent.mouseLeave(el)
    expect(off).toHaveBeenCalledTimes(1)
  })
})
