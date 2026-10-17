// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useMapSidebar } from './useMapSidebar'

// Direct coverage for the sidebar width/collapse/drag mechanics pulled out
// of ResourceMapView.tsx (see this file's own top comment for why
// sidebarVisible/toggleSidebar deliberately stay behind in that component
// instead of living here) — extracted specifically because it's the one
// genuinely self-contained seam in that 2335-line file, re-surveyed
// 2026-09-22. ResourceMapView.test.tsx's existing 50 tests cover this
// indirectly and stayed green through the extraction unchanged; these are
// the direct tests, per this repo's own established lesson (see
// categoryEditorLogic.ts's test file) that indirect coverage alone doesn't
// prove an extraction is correct.

const STORAGE_KEY = 'jpc:map-sidebar-width'

function pointerEvent(overrides: Partial<{ clientX: number; pointerId: number; setPointerCapture: () => void }> = {}) {
  const setPointerCapture = overrides.setPointerCapture ?? (() => {})
  return {
    clientX: overrides.clientX ?? 0,
    pointerId: overrides.pointerId ?? 1,
    currentTarget: { setPointerCapture },
  } as unknown as React.PointerEvent
}

function keyEvent(key: string) {
  return { key, preventDefault: () => {} } as unknown as React.KeyboardEvent
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('useMapSidebar — initial state', () => {
  it('starts collapsed=false, opened-manually=false, and not dragging', () => {
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarCollapsed).toBe(false)
    expect(result.current.sidebarOpenedManually).toBe(false)
    expect(result.current.isDraggingSidebar).toBe(false)
  })

  it('defaults to SIDEBAR_DEFAULT_WIDTH with nothing stored', () => {
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('restores a previously stored, in-range width', () => {
    localStorage.setItem(STORAGE_KEY, '500')
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarWidth).toBe(500)
  })

  it('clamps a stored width that is out of the current min/max range', () => {
    localStorage.setItem(STORAGE_KEY, '9999')
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('falls back to the default for garbage stored data', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-number')
    const { result } = renderHook(() => useMapSidebar())
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
  })
})

describe('useMapSidebar — dragging', () => {
  it('tracks the pointer during a drag, clamped to the min/max range', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerDown(pointerEvent({ clientX: 100 })))
    expect(result.current.isDraggingSidebar).toBe(true)

    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: 100 + 50 })))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH + 50)
  })

  it('clamps past SIDEBAR_MAX_WIDTH rather than growing without bound', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerDown(pointerEvent({ clientX: 0 })))
    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: 10_000 })))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('clamps below SIDEBAR_MIN_WIDTH rather than shrinking without bound', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerDown(pointerEvent({ clientX: 0 })))
    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: -10_000 })))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('does nothing on pointermove without an active drag', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: 999 })))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('persists the final width to localStorage only on release, not on every move', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerDown(pointerEvent({ clientX: 0 })))
    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: 40 })))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => result.current.onSidebarHandlePointerUp())
    expect(localStorage.getItem(STORAGE_KEY)).toBe(String(SIDEBAR_DEFAULT_WIDTH + 40))
    expect(result.current.isDraggingSidebar).toBe(false)
  })

  it('a release with no active drag is a harmless no-op', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerUp())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('snaps back to the width the drag started from on cancel, without persisting', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandlePointerDown(pointerEvent({ clientX: 0 })))
    act(() => result.current.onSidebarHandlePointerMove(pointerEvent({ clientX: 100 })))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH + 100)

    act(() => result.current.onSidebarHandlePointerCancel())
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(result.current.isDraggingSidebar).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('useMapSidebar — keyboard resize', () => {
  it('ArrowRight grows the width and persists immediately', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandleKeyDown(keyEvent('ArrowRight')))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH + 16)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(String(SIDEBAR_DEFAULT_WIDTH + 16))
  })

  it('ArrowLeft shrinks the width', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandleKeyDown(keyEvent('ArrowLeft')))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH - 16)
  })

  it('clamps at the bounds instead of going past them', () => {
    const { result } = renderHook(() => useMapSidebar())
    for (let i = 0; i < 50; i++) act(() => result.current.onSidebarHandleKeyDown(keyEvent('ArrowRight')))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('ignores any other key', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.onSidebarHandleKeyDown(keyEvent('Enter')))
    expect(result.current.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('useMapSidebar — collapse/opened-manually setters', () => {
  it('setSidebarCollapsed and setSidebarOpenedManually both update their own state independently', () => {
    const { result } = renderHook(() => useMapSidebar())
    act(() => result.current.setSidebarCollapsed(true))
    expect(result.current.sidebarCollapsed).toBe(true)
    expect(result.current.sidebarOpenedManually).toBe(false)

    act(() => result.current.setSidebarOpenedManually(true))
    expect(result.current.sidebarOpenedManually).toBe(true)
    expect(result.current.sidebarCollapsed).toBe(true) // unaffected by the other setter
  })
})

describe('clampSidebarWidth', () => {
  it('passes an in-range value through unchanged', () => {
    expect(clampSidebarWidth(450)).toBe(450)
  })

  it('clamps to the min/max bounds', () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(99_999)).toBe(SIDEBAR_MAX_WIDTH)
  })
})
