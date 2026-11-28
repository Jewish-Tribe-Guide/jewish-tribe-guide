// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import HoverLabel, { forgetHoverLabels, HOVER_DELAY_MS, WARM_MS } from './HoverLabel'

// The admin's own hover label (Nov 28: the browser's `title` waited about a
// second). Shown after a short wait, at once along a row, never on a touch.

beforeEach(() => {
  vi.useFakeTimers()
  forgetHoverLabels()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function two() {
  render(
    <>
      <HoverLabel label="Edit">
        <button type="button">e</button>
      </HoverLabel>
      <HoverLabel label="Remove">
        <button type="button">r</button>
      </HoverLabel>
    </>,
  )
  return { edit: screen.getByText('e').parentElement!, remove: screen.getByText('r').parentElement! }
}

const label = () => screen.queryByTestId('hover-label')?.textContent ?? null

describe('HoverLabel', () => {
  it('shows after a short wait, not the browser’s second', () => {
    const { edit } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'mouse' })
    expect(label()).toBeNull()
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS))
    expect(label()).toBe('Edit')
    expect(HOVER_DELAY_MS).toBeLessThanOrEqual(200)
  })

  it('a pointer that only passes over shows nothing', () => {
    const { edit } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS - 50))
    fireEvent.pointerLeave(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS))
    expect(label()).toBeNull()
  })

  it('moving to the next icon names it at once', () => {
    const { edit, remove } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS))
    fireEvent.pointerLeave(edit, { pointerType: 'mouse' })
    fireEvent.pointerEnter(remove, { pointerType: 'mouse' })
    expect(label()).toBe('Remove')
  })

  it('waits again once the row has gone cold', () => {
    const { edit, remove } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS))
    fireEvent.pointerLeave(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(WARM_MS + 1))
    fireEvent.pointerEnter(remove, { pointerType: 'mouse' })
    expect(label()).toBeNull()
  })

  it('a touch shows nothing', () => {
    const { edit } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS * 4))
    expect(label()).toBeNull()
  })

  it('pressing it puts the label away', () => {
    const { edit } = two()
    fireEvent.pointerEnter(edit, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS))
    fireEvent.pointerDown(edit, { pointerType: 'mouse' })
    expect(label()).toBeNull()
  })
})
