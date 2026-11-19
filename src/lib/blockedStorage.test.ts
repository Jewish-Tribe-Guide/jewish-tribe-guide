// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { loadPinned } from './pinned'
import { loadDroppedPins } from './droppedPins'
import { loadSavedSearches } from './savedSearches'
import { getVoterToken } from './voteToken'
import { storageGet, storageSet } from './safeStorage'
import { SIDEBAR_DEFAULT_WIDTH, useMapSidebar } from '@/components/map/useMapSidebar'

// Safari's "Block all cookies": reading `window.localStorage` itself throws.
// Each of these read or wrote it outside a try, and the Map page and the
// home showed "Something went wrong" (Nov 18, item 20 of the public
// review). They read as empty now, and a write is dropped.

const original = Object.getOwnPropertyDescriptor(window, 'localStorage')

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
})

afterEach(() => {
  if (original) Object.defineProperty(window, 'localStorage', original)
  else delete (window as unknown as Record<string, unknown>).localStorage
})

describe('with storage blocked', () => {
  it('reads as empty and drops a write', () => {
    expect(storageGet('k')).toBeNull()
    expect(() => storageSet('k', 'v')).not.toThrow()
  })

  it('saved places, dropped pins and saved searches load as none', () => {
    expect(loadPinned()).toEqual([])
    expect(loadDroppedPins()).toEqual([])
    expect(loadSavedSearches()).toEqual([])
  })

  it('a vote still has a token, the same one while the page is open', () => {
    const token = getVoterToken()
    expect(token).toMatch(/[0-9a-f-]{36}/)
    expect(getVoterToken()).toBe(token)
  })

  it('the map’s sidebar opens at its usual width, and a resize is kept on screen', () => {
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    act(() => result.current.onSidebarHandleKeyDown({ key: 'ArrowRight', preventDefault: () => {} } as unknown as React.KeyboardEvent))
    expect(result.current.sidebarWidth).toBeGreaterThan(SIDEBAR_DEFAULT_WIDTH)
  })
})
