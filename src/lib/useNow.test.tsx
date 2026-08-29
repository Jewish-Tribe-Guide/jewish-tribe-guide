// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useNow, useToday } from './useNow'

// Nothing in the app used to recompute time: there was no setInterval anywhere
// in src, and the only visibilitychange listener was the geolocation watch. So
// an Open badge, today's hours row and the calculated zman times were all
// frozen at whatever moment the page rendered — which for a phone left in a
// pocket between hospital visits is the wrong moment by hours.

function Clock() {
  return <span data-testid="now">{useNow()}</span>
}

function Day() {
  const day = useToday()
  renders++
  return <span data-testid="day">{day}</span>
}

let renders = 0

function showVisible(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  renders = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-28T14:00:00'))
})

afterEach(() => {
  cleanup()
  showVisible(false)
  vi.useRealTimers()
})

describe('useNow', () => {
  it('advances once a minute while the tab is visible', () => {
    render(<Clock />)
    const first = Number(screen.getByTestId('now').textContent)

    act(() => void vi.advanceTimersByTime(60_000))
    expect(Number(screen.getByTestId('now').textContent)).toBe(first + 60_000)
  })

  // The one that matters: a tab away for hours has missed every tick, so the
  // correction has to happen on the way back in, not on the next interval.
  it('resyncs immediately when the tab becomes visible again', () => {
    render(<Clock />)
    const first = Number(screen.getByTestId('now').textContent)

    act(() => showVisible(true))
    act(() => void vi.advanceTimersByTime(3 * 60 * 60 * 1000))
    // Still frozen — a hidden tab has nobody to show a fresh badge to.
    expect(Number(screen.getByTestId('now').textContent)).toBe(first)

    act(() => showVisible(false))
    expect(Number(screen.getByTestId('now').textContent)).toBe(first + 3 * 60 * 60 * 1000)
  })

  it('stops ticking while hidden, and starts again on return', () => {
    render(<Clock />)
    act(() => showVisible(true))
    const whileHidden = Number(screen.getByTestId('now').textContent)
    act(() => void vi.advanceTimersByTime(5 * 60_000))
    expect(Number(screen.getByTestId('now').textContent)).toBe(whileHidden)

    act(() => showVisible(false))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(Number(screen.getByTestId('now').textContent)).toBe(whileHidden + 6 * 60_000)
  })

  it('tears the timer down when the last subscriber unmounts', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = render(<Clock />)
    unmount()
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})

describe('useToday', () => {
  it('does not re-render on a tick that stays inside the same day', () => {
    render(<Day />)
    const before = renders

    act(() => void vi.advanceTimersByTime(60_000))
    act(() => void vi.advanceTimersByTime(60_000))

    // Equal strings are ===, so React bails out — this is what makes it safe
    // to use as an effect dependency (useZmanAnchors, useZmanim) without
    // refetching every minute.
    expect(renders).toBe(before)
  })

  it('changes when the date rolls over', () => {
    render(<Day />)
    expect(screen.getByTestId('day').textContent).toBe('2026-8-28')

    act(() => void vi.advanceTimersByTime(11 * 60 * 60 * 1000))
    expect(screen.getByTestId('day').textContent).toBe('2026-8-29')
  })
})
