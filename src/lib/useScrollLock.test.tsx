// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useScrollLock } from './useScrollLock'

afterEach(() => {
  cleanup()
  document.documentElement.style.overflow = ''
  document.documentElement.style.paddingRight = ''
})

function Locked({ locked }: { locked: boolean }) {
  useScrollLock(locked)
  return <div>content</div>
}

describe('useScrollLock', () => {
  it('locks the root element rather than taking the body out of flow', () => {
    render(<Locked locked />)

    expect(document.documentElement.style.overflow).toBe('hidden')
    // The regression this exists to prevent. Pinning the body with
    // `position: fixed; top: -scrollY` is the usual recipe, and it breaks every
    // `position: sticky` inside it: the document scroll resets to 0, the sticky
    // header has no scrollport left to stick to, and it drops back to the top
    // of the body box — scrollY pixels above the viewport, taking any popover
    // anchored to it along with it. Measured at scroll 600, the header went
    // from top:0 to top:-600 the moment the location popover opened.
    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
  })

  it('restores what it changed on unlock', () => {
    const { rerender } = render(<Locked locked />)
    expect(document.documentElement.style.overflow).toBe('hidden')

    rerender(<Locked locked={false} />)
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.documentElement.style.paddingRight).toBe('')
  })

  it('does nothing at all while unlocked', () => {
    render(<Locked locked={false} />)
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.position).toBe('')
  })
})
