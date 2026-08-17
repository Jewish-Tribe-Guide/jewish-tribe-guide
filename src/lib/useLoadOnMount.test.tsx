// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useLoadOnMount } from './useLoadOnMount'

function Harness({ load }: { load: () => void }) {
  useLoadOnMount(load)
  return null
}

describe('useLoadOnMount', () => {
  it('calls load once on mount', () => {
    const load = vi.fn()
    render(<Harness load={load} />)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not call load again on a re-render with the same load reference', () => {
    const load = vi.fn()
    const { rerender } = render(<Harness load={load} />)
    rerender(<Harness load={load} />)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('calls the new load when the reference changes (e.g. a dependency in the caller changed)', () => {
    const loadA = vi.fn()
    const loadB = vi.fn()
    const { rerender } = render(<Harness load={loadA} />)
    rerender(<Harness load={loadB} />)
    expect(loadA).toHaveBeenCalledTimes(1)
    expect(loadB).toHaveBeenCalledTimes(1)
  })
})
