import { describe, expect, it, vi } from 'vitest'
import { createVisibilityLoader } from './visibilityLoader'

function setup(load: () => Promise<string>) {
  let t = 1_000
  const onError = vi.fn()
  const get = createVisibilityLoader({
    load,
    empty: 'EMPTY',
    ttlMs: 30_000,
    retryMs: 5_000,
    now: () => t,
    onError,
  })
  return { get, onError, advance: (ms: number) => (t += ms) }
}

describe('createVisibilityLoader', () => {
  it('loads once and serves the cached value inside the TTL', async () => {
    const load = vi.fn().mockResolvedValue('A')
    const { get, advance } = setup(load)

    expect(await get()).toBe('A')
    advance(29_999)
    expect(await get()).toBe('A')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('refreshes after the TTL', async () => {
    const load = vi.fn().mockResolvedValueOnce('A').mockResolvedValueOnce('B')
    const { get, advance } = setup(load)

    await get()
    advance(30_000)
    expect(await get()).toBe('B')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight load between concurrent callers', async () => {
    let resolve!: (v: string) => void
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const { get } = setup(load)

    const all = Promise.all([get(), get(), get(), get()])
    resolve('A')

    expect(await all).toEqual(['A', 'A', 'A', 'A'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps serving the last good value when a refresh fails, instead of going empty', async () => {
    const load = vi.fn().mockResolvedValueOnce('GOOD').mockRejectedValueOnce(new Error('db down'))
    const { get, advance, onError } = setup(load)

    await get()
    advance(30_000)

    expect(await get()).toBe('GOOD')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('retries after the short delay, not the full TTL, and recovers', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('GOOD')
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce('NEW')
    const { get, advance } = setup(load)

    await get()
    advance(30_000)
    await get() // fails, keeps GOOD
    advance(4_999)
    expect(await get()).toBe('GOOD') // still inside the retry delay: no hammering
    expect(load).toHaveBeenCalledTimes(2)

    advance(1)
    expect(await get()).toBe('NEW')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('fails open (empty) only when nothing has ever loaded', async () => {
    const load = vi.fn().mockRejectedValue(new Error('no env'))
    const { get } = setup(load)
    expect(await get()).toBe('EMPTY')
  })

  it('survives a synchronous throw from load (a missing env var)', async () => {
    const load = vi.fn(() => {
      throw new Error('Missing required environment variable')
    })
    const { get, onError } = setup(load as unknown as () => Promise<string>)

    expect(await get()).toBe('EMPTY')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('does not stay stuck after a failure: a later call can start a new load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('A')
    const { get, advance } = setup(load)

    await get()
    advance(5_000)
    expect(await get()).toBe('A')
  })
})
