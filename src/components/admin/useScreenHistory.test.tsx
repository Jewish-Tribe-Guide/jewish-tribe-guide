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

  // The same again for a move queued behind it, which then worked out its
  // address with no page left (PR 396, Nov 18, from ModerationQueue.test.tsx).
  it('drops the moves queued behind it', async () => {
    vi.useFakeTimers()
    try {
      const router = { push: vi.fn(), replace: vi.fn() } as never
      void moveTo(router, 'push', () => '/never-lands')
      const queued = moveTo(router, 'push', () => `${window.location.pathname}?b=1`)
      await vi.advanceTimersByTimeAsync(20)
      vi.stubGlobal('window', undefined)
      await vi.advanceTimersByTimeAsync(40)
      vi.unstubAllGlobals()
      await expect(queued).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})

describe('a move that fails', () => {
  it('leaves the moves after it to run', async () => {
    window.history.replaceState(null, '', '/page')
    const failed = moveTo(router as never, 'push', () => {
      throw new Error('no address')
    })
    await expect(failed).rejects.toThrow('no address')
    await moveTo(router as never, 'push', () => '/page?after=1')
    expect(here()).toBe('/page?after=1')
  })
})
