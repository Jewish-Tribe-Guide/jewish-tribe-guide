import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { whenSettled } from './whenSettled'

const at = (top: number) => ({ getBoundingClientRect: () => ({ top }) }) as Element

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('whenSettled', () => {
  it('calls back once the element has stopped moving', () => {
    const tops = [100, 60, 40, 40, 40]
    let i = 0
    const done = vi.fn()
    whenSettled(() => at(tops[Math.min(i++, tops.length - 1)]), done)
    vi.advanceTimersByTime(32 * 4)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(32)
    expect(done).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives up on an element that never appears, leaving no timer behind', () => {
    const done = vi.fn()
    whenSettled(() => null, done)
    vi.advanceTimersByTime(32 * 100)
    expect(vi.getTimerCount()).toBe(0)
    expect(done).not.toHaveBeenCalled()
  })

  it('stops when cancelled', () => {
    const done = vi.fn()
    const cancel = whenSettled(() => at(10), done)
    vi.advanceTimersByTime(32)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(1000)
    expect(done).not.toHaveBeenCalled()
  })
})
