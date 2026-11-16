// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { preloadable } from './preloadable'

afterEach(cleanup)

const Place = ({ name }: { name: string }) => <h2>{name}</h2>

describe('preloadable', () => {
  // The point of it: React.lazy (next/dynamic) pauses on its first draw even
  // with the code here, and React holds that pause for 300ms. Loaded ahead,
  // this has to draw in the same render, with no loading state at all.
  it('draws at once, in the first render, once loaded ahead', async () => {
    const C = preloadable(() => Promise.resolve({ default: Place }))
    C.preload()
    await Promise.resolve()
    await Promise.resolve()

    render(<C name="Trader Joe’s" />)

    expect(screen.getByRole('heading', { name: 'Trader Joe’s' })).toBeInTheDocument()
  })

  it('still loads on first use when nothing loaded it ahead', async () => {
    const C = preloadable(() => Promise.resolve({ default: Place }))

    render(<C name="Goldi" />)

    expect(await screen.findByRole('heading', { name: 'Goldi' })).toBeInTheDocument()
  })

  it('loads the code once, however often it is asked', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Place }))
    const C = preloadable(load)
    C.preload()
    C.preload()
    render(<C name="A" />)
    await screen.findByRole('heading', { name: 'A' })

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('tries again after a failed download', async () => {
    const load = vi
      .fn<() => Promise<{ default: typeof Place }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: Place })
    const C = preloadable(load)
    C.preload()
    await new Promise((r) => setTimeout(r, 0))
    C.preload()
    await new Promise((r) => setTimeout(r, 0))

    render(<C name="B" />)

    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
