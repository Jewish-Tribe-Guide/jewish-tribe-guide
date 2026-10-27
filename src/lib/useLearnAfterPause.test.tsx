// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const m = vi.hoisted(() => ({ learnFrom: vi.fn() }))
vi.mock('./askReader', () => ({ learnFrom: m.learnFrom }))

const { useLearnAfterPause, LEARN_PAUSE_MS } = await import('./useLearnAfterPause')

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

type Props = { query: string; foundNothing: boolean; ready?: boolean }
const hook = (props: Props) =>
  renderHook((p: Props) => useLearnAfterPause({ ready: true, community: 'philly', ...p }), { initialProps: props })

describe('useLearnAfterPause', () => {
  it('reads a search that found nothing once the typing stops, without Enter', () => {
    hook({ query: 'trader joes', foundNothing: true })
    vi.advanceTimersByTime(LEARN_PAUSE_MS - 1)
    expect(m.learnFrom).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(m.learnFrom).toHaveBeenCalledWith('trader joes', 'philly')
  })

  it('reads nothing while the words are still being typed', () => {
    const { rerender } = hook({ query: 'trad', foundNothing: true })
    vi.advanceTimersByTime(1000)
    rerender({ query: 'trader j', foundNothing: true })
    vi.advanceTimersByTime(1000)
    rerender({ query: 'trader joes', foundNothing: true })
    vi.advanceTimersByTime(LEARN_PAUSE_MS)
    expect(m.learnFrom).toHaveBeenCalledTimes(1)
    expect(m.learnFrom).toHaveBeenCalledWith('trader joes', 'philly')
  })

  it('reads nothing the search found, or while the page is loading', () => {
    hook({ query: 'kosher pizza', foundNothing: false })
    hook({ query: 'kosher pizza', foundNothing: true, ready: false })
    hook({ query: 'k', foundNothing: true })
    vi.advanceTimersByTime(LEARN_PAUSE_MS * 2)
    expect(m.learnFrom).not.toHaveBeenCalled()
  })
})
