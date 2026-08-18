// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useShareLink } from './useShareLink'

// A thin harness exposing share()/copied as a button — useShareLink is a
// hook, not a component, so this is the plain way to drive it under RTL.
// Same approach as useSiteNavigation.test.tsx.
function Harness({ path, title }: { path: string; title: string }) {
  const { share, copied } = useShareLink(path, title)
  return <button onClick={share}>{copied ? 'Copied!' : 'Share'}</button>
}

// Overrides individual navigator properties rather than replacing the whole
// `navigator` global, which broke unrelated feature detection elsewhere.
function stubShare(fn: typeof navigator.share | undefined) {
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true })
}
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  cleanup()
  delete (navigator as { share?: unknown }).share
  delete (navigator as { clipboard?: unknown }).clipboard
})

describe('useShareLink', () => {
  it('calls navigator.share with the title and full origin-qualified URL when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    stubShare(shareMock)
    render(<Harness path="/philly/grocery/goldi-a1b2c3" title="Goldi's Kosher Market" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(shareMock).toHaveBeenCalledWith({
      title: "Goldi's Kosher Market",
      url: `${window.location.origin}/philly/grocery/goldi-a1b2c3`,
    })
    // The OS share sheet handles its own success feedback — this component
    // never shows "Copied!" when navigator.share succeeded.
    expect(screen.getByRole('button')).toHaveTextContent('Share')
  })

  it('falls back to clipboard copy and shows "Copied!" when navigator.share is unavailable', async () => {
    stubShare(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<Harness path="/philly/grocery/goldi-a1b2c3" title="Goldi's Kosher Market" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/philly/grocery/goldi-a1b2c3`)
    expect(screen.getByRole('button')).toHaveTextContent('Copied!')
  })

  it('reverts "Copied!" back to "Share" after the timeout', async () => {
    vi.useFakeTimers()
    stubShare(undefined)
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<Harness path="/philly/grocery/goldi-a1b2c3" title="Goldi's Kosher Market" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button')).toHaveTextContent('Copied!')

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button')).toHaveTextContent('Share')
    vi.useRealTimers()
  })

  it('does not fall back to clipboard copy when the visitor dismisses the native share sheet', async () => {
    const shareMock = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    stubShare(shareMock)
    const writeText = vi.fn()
    stubClipboard(writeText)
    render(<Harness path="/philly/grocery/goldi-a1b2c3" title="Goldi's Kosher Market" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(shareMock).toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveTextContent('Share')
  })
})
