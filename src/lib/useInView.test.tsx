// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { resetMockIntersectionObserver, triggerAllIntersections } from '@/test/intersectionObserverMock'
import { useInView } from './useInView'

function Harness() {
  const [ref, inView] = useInView<HTMLDivElement>()
  return <div ref={ref}>{inView ? 'in view' : 'not in view'}</div>
}

afterEach(() => {
  cleanup()
  resetMockIntersectionObserver()
})

describe('useInView', () => {
  it('starts false, matching the server render', () => {
    render(<Harness />)
    expect(screen.getByText('not in view')).toBeInTheDocument()
  })

  it('flips true once the element intersects', () => {
    render(<Harness />)
    act(() => triggerAllIntersections())
    expect(screen.getByText('in view')).toBeInTheDocument()
  })

  it('never flips for an element that never intersects (e.g. display:none)', () => {
    // The mock only fires callbacks for elements it actually observed —
    // never calling triggerAllIntersections is exactly what a `hidden`
    // element (no box, so IntersectionObserver never reports it) looks
    // like in real use. See useInView's own doc comment.
    render(<Harness />)
    expect(screen.getByText('not in view')).toBeInTheDocument()
  })
})
