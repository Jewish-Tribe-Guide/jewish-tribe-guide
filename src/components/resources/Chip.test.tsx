// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import Chip from './Chip'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Chip', () => {
  // The bug this guards: a click's darker shade came only from CSS `:active`,
  // which reverts the instant the pointer/finger lifts — before there's any
  // chance to notice the click actually did something (e.g. a badge that
  // filters the page). A clickable chip should hold that confirmed look for
  // a moment after the click itself, not just for the duration of the press.
  it('holds its pressed tone briefly after a click, then reverts', () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    render(<Chip tone="slate" onClick={onClick}>IKC</Chip>)
    const button = screen.getByRole('button', { name: 'IKC' })
    const classes = () => button.className.split(/\s+/)

    expect(classes()).not.toContain('bg-primary')

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(classes()).toContain('bg-primary')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(classes()).not.toContain('bg-primary')
  })
})
