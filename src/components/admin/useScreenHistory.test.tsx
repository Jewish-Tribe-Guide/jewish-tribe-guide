// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { moveTo, useScreenHistory } from './useScreenHistory'

// Next's router as it behaves here: an entry is written only once the
// navigation lands, and a newer navigation drops one still on its way.
let pending: ReturnType<typeof setTimeout> | null = null
const router = {
  push: vi.fn((url: string) => land(() => window.history.pushState({}, '', url))),
  replace: vi.fn((url: string) => land(() => window.history.replaceState({}, '', url))),
}
function land(write: () => void) {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    write()
  }, 30)
}
vi.mock('next/navigation', () => ({ useRouter: () => router }))

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
})

const here = () => window.location.pathname + window.location.search

describe('useScreenHistory', () => {
  it('keeps every screen of a quick run of clicks, so stepping back lands where it should', async () => {
    window.history.replaceState(null, '', '/editor')
    const start = window.history.length
    const { result } = renderHook(() => useScreenHistory())
    void result.current.push({ add: { at: 'list' } })
    void result.current.push({ add: { at: 'make' } })
    await result.current.back(2)
    await waitFor(() => expect(here()).toBe('/editor'))
    expect(window.history.length).toBe(start + 2)
    window.history.forward()
    await waitFor(() => expect(here()).toBe('/editor?add=list'))
  })

  it('writes a replace over the screen it follows, not one still on its way', async () => {
    window.history.pushState(null, '', '/before')
    window.history.pushState(null, '', '/page')
    const { result } = renderHook(() => useScreenHistory())
    void result.current.push({ field: 'a' })
    await result.current.replace({ field: 'b' })
    expect(here()).toBe('/page?field=b')
    await result.current.back()
    expect(here()).toBe('/page')
  })
})

describe('a move still waiting when the page goes', () => {
  // A test's page is torn down while a move waits to land (the router here
  // never lands it): its next look at the address threw "window is not
  // defined" after the file had passed, failing CI's unit run (PR 390,
  // Nov 16, from EruvInfo.test.tsx). Nothing is left to wait for then.
  it('stops waiting instead of throwing', async () => {
    vi.useFakeTimers()
    try {
      const moved = moveTo({ push: vi.fn(), replace: vi.fn() } as never, 'push', () => '/never-lands')
      await vi.advanceTimersByTimeAsync(20)
      vi.stubGlobal('window', undefined)
      await vi.advanceTimersByTimeAsync(40)
      vi.unstubAllGlobals()
      await expect(moved).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
