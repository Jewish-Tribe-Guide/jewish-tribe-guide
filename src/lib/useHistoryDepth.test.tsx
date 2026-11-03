// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { screensOpenIn, useHistoryDepth } from './useHistoryDepth'

// The browser's Back as a swipe gives it: the entry before, then popstate.
// jsdom's history.back() moves asynchronously, so the tests drive the two
// halves themselves.
function swipeBack(to: unknown) {
  act(() => {
    window.history.replaceState(to, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state: to }))
  })
}

beforeEach(() => window.history.replaceState({ placeOpen: 'x' }, '', '/philly/admin/places'))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useHistoryDepth', () => {
  it('opening a screen inside a page adds an entry, keeping what the page had', () => {
    const before = window.history.length
    const { rerender } = renderHook(({ d }) => useHistoryDepth('step', d, () => {}), { initialProps: { d: 0 } })
    expect(window.history.length).toBe(before)
    rerender({ d: 1 })
    expect(window.history.length).toBe(before + 1)
    expect(window.history.state).toEqual({ placeOpen: 'x', step: 1 })
    rerender({ d: 2 })
    expect(window.history.length).toBe(before + 2)
    expect(window.history.state.step).toBe(2)
  })

  it('a swipe back closes the screen, one level at a time, not the page under it', () => {
    const back = vi.fn()
    const { rerender } = renderHook(({ d }) => useHistoryDepth('step', d, back), { initialProps: { d: 0 } })
    rerender({ d: 2 })
    swipeBack({ placeOpen: 'x', step: 1 })
    expect(back).toHaveBeenCalledTimes(1)
    rerender({ d: 1 })
    swipeBack({ placeOpen: 'x' })
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('the page’s own Back takes the entry off with it, and is not called twice', () => {
    const back = vi.fn()
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const { rerender } = renderHook(({ d }) => useHistoryDepth('step', d, back), { initialProps: { d: 0 } })
    rerender({ d: 1 })
    rerender({ d: 0 })
    expect(go).toHaveBeenCalledWith(-1)
    swipeBack({ placeOpen: 'x' })
    expect(back).not.toHaveBeenCalled()
  })

  it('a page arriving on an entry left behind keeps it as the page, without moving', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    window.history.replaceState({ placeOpen: 'x', step: 1 }, '')
    renderHook(() => useHistoryDepth('step', 0, () => {}))
    expect(go).not.toHaveBeenCalled()
    expect(window.history.state).toEqual({ placeOpen: 'x', step: 0 })
  })

  it('counts the entries its screens put over a page, for one leaving by Back', () => {
    const { rerender } = renderHook(({ d }) => useHistoryDepth('step', d, () => {}), { initialProps: { d: 0 } })
    renderHook(() => useHistoryDepth('change', 1, () => {}))
    rerender({ d: 2 })
    expect(screensOpenIn(window.history.state)).toBe(3)
    expect(screensOpenIn({ placeOpen: 'x' })).toBe(0)
  })

  it('leaves a popstate that isn’t its own alone', () => {
    const back = vi.fn()
    renderHook(() => useHistoryDepth('step', 0, back))
    swipeBack(null)
    expect(back).not.toHaveBeenCalled()
  })
})
