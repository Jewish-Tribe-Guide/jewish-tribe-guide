// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPostHogWhenIdle } from './deferredPostHog'

const init = vi.fn()
const load = vi.fn(async () => ({ default: { init } }))
const base = { enabled: true, token: 'tok', host: 'https://ph.example', load }

function setReadyState(v: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', { value: v, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  setReadyState('complete')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('startPostHogWhenIdle', () => {
  it.each([
    ['disabled', { enabled: false }],
    ['no token', { token: undefined }],
    ['no host', { host: undefined }],
  ])('never loads PostHog when %s', async (_n, override) => {
    expect(startPostHogWhenIdle({ ...base, ...override })).toBe(false)
    await vi.runAllTimersAsync()
    expect(load).not.toHaveBeenCalled()
  })

  it('does not load PostHog synchronously — that is the whole point', () => {
    vi.stubGlobal('requestIdleCallback', vi.fn())
    expect(startPostHogWhenIdle(base)).toBe(true)
    expect(load).not.toHaveBeenCalled()
  })

  it('loads and inits once the browser is idle', async () => {
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => setTimeout(fn, 10))
    startPostHogWhenIdle(base)
    await vi.runAllTimersAsync()

    expect(load).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith('tok', { api_host: 'https://ph.example', defaults: '2025-05-24' })
  })

  it('waits for the window load event when the page is still loading', async () => {
    setReadyState('loading')
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => setTimeout(fn, 10))
    startPostHogWhenIdle(base)
    await vi.runAllTimersAsync()
    expect(load).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('falls back to a timer where requestIdleCallback does not exist (Safari)', async () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    startPostHogWhenIdle(base)
    await vi.advanceTimersByTimeAsync(2000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('swallows a failed chunk load instead of throwing', async () => {
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => setTimeout(fn, 0))
    load.mockRejectedValueOnce(new Error('ChunkLoadError'))
    startPostHogWhenIdle(base)
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow()
  })
})
