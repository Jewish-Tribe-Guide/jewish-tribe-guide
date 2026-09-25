// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const m = vi.hoisted(() => ({ track: vi.fn(), countEvent: vi.fn(), slug: 'philly' as string | null }))
vi.mock('@vercel/analytics', () => ({ track: m.track }))
vi.mock('./countEvent', () => ({ countEvent: m.countEvent }))
vi.mock('./communityContext', () => ({ useOptionalCommunitySlug: () => m.slug }))

const { useLogSearchMiss } = await import('./useLogSearchMiss')

beforeEach(() => {
  vi.useFakeTimers()
  m.slug = 'philly'
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

const run = (props: { query: string; hasResults: boolean; ready?: boolean }) => {
  renderHook(() => useLogSearchMiss({ ready: true, source: 'home', ...props }))
  vi.advanceTimersByTime(1600)
}

describe('useLogSearchMiss', () => {
  it('counts a settled search that found nothing, by its text', () => {
    run({ query: 'Pas Yisroel', hasResults: false })
    expect(m.countEvent).toHaveBeenCalledWith('philly', 'search_miss', 'pas yisroel')
    // The analytics event still never carries the text.
    expect(m.track).toHaveBeenCalledWith('search', { source: 'home', hasResults: false })
  })

  it('doesn’t count a search that found something', () => {
    run({ query: 'challah', hasResults: true })
    expect(m.countEvent).not.toHaveBeenCalled()
  })

  it('doesn’t count while the data is still loading, or outside a community', () => {
    run({ query: 'challah', hasResults: false, ready: false })
    m.slug = null
    run({ query: 'wine', hasResults: false })
    expect(m.countEvent).not.toHaveBeenCalled()
  })
})
