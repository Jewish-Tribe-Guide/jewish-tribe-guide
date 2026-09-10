// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNavTransitionProps } from './navTransitions'

// facebook/react#35336: a <ViewTransition> with BOTH `enter` and `exit` set,
// wrapping a <Suspense> with a real fallback (SlugScreen's own shape),
// hangs/crashes iOS Safari — and iOS Chrome, since Apple requires every iOS
// browser to run WebKit's engine regardless of branding. Reported live on
// both. Omitting both props entirely (not just mapping their values to
// 'none') is what actually avoids the trigger, per the linked issue.
function setUserAgent(ua: string, platform = '', maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { userAgent: ua, platform, maxTouchPoints })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNavTransitionProps on iOS', () => {
  it('omits enter/exit entirely on iPhone (any browser — all iOS browsers are WebKit)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    )
    const { result } = renderHook(() => useNavTransitionProps())
    expect(result.current).toEqual({ default: 'none' })
    expect(result.current).not.toHaveProperty('enter')
    expect(result.current).not.toHaveProperty('exit')
  })

  it('omits enter/exit on iPhone Chrome too (CriOS — still WebKit underneath)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1',
    )
    const { result } = renderHook(() => useNavTransitionProps())
    expect(result.current).toEqual({ default: 'none' })
  })

  it('omits enter/exit on iPad (reports as "Macintosh" in the UA — distinguished by touch points)', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'MacIntel',
      5,
    )
    const { result } = renderHook(() => useNavTransitionProps())
    expect(result.current).toEqual({ default: 'none' })
  })

  it('keeps the real enter/exit map on a real Mac (same UA family as iPad, but no touch points)', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'MacIntel',
      0,
    )
    const { result } = renderHook(() => useNavTransitionProps())
    expect(result.current).toHaveProperty('enter')
    expect(result.current).toHaveProperty('exit')
  })

  it('keeps the real enter/exit map on Android', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36')
    const { result } = renderHook(() => useNavTransitionProps())
    expect(result.current).toHaveProperty('enter')
    expect(result.current).toHaveProperty('exit')
  })
})
