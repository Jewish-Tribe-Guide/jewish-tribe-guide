import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { after, revalidatePath } = vi.hoisted(() => ({
  after: vi.fn<(task: () => Promise<void>) => void>(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/server', () => ({ after }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { IN_FLIGHT_RENDER_GRACE_MS } from './inFlightRenderGrace'
import { revalidateRouteAfterInFlightRenders } from './revalidateAfterInFlightRenders'

// The wiring only. Whether the second pass really reaches a page entry that a
// regeneration stored over the save is proved against a real server, by
// e2e-cache's "mid-regeneration" test.
describe('revalidateRouteAfterInFlightRenders', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    after.mockClear()
    revalidatePath.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('defers the invalidation to after the response, not inline', () => {
    revalidateRouteAfterInFlightRenders('/[community]/about')
    expect(after).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('waits out the grace period, then invalidates every page of the pattern', async () => {
    revalidateRouteAfterInFlightRenders('/[community]/about')
    const task = after.mock.calls[0][0]()

    await vi.advanceTimersByTimeAsync(IN_FLIGHT_RENDER_GRACE_MS - 1)
    expect(revalidatePath, 'a render that started before the save may still be running').not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await task
    // 'page' with the dynamic pattern: a tag the caller's own concrete-path
    // revalidation did not use, so Next's per-request dedupe cannot drop it.
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/[community]/about', 'page')
  })

  it('leaves a window comfortably above the measured in-flight render time', () => {
    // Under 0.6s for /about locally; CI's shared test project is slower.
    expect(IN_FLIGHT_RENDER_GRACE_MS).toBeGreaterThanOrEqual(3_000)
  })
})
