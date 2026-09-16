// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useZmanim } from './useZmanim'
import { useNow } from './useNow'

// Confirmed live: the home screen mounts both its mobile and desktop layouts
// at once (CSS toggles which one shows, not JS — see Landing's own doc), so
// two live instances of this hook — ZmanimStrip's desktop copy and the
// mobile equivalent — called it with the exact same community-default
// coordinates on every single page load, firing /api/zmanim twice for one
// visit. This file locks in the dedup that fixed it, the same module-level,
// day-scoped cache shape useZmanAnchors.test.tsx already covers for the
// sibling hook.

function Probe({ testId, coords }: { testId: string; coords: { lat: number; lng: number } | null }) {
  const { data, status } = useZmanim(coords)
  return <span data-testid={testId}>{`${status}:${data?.hebrewDate ?? '—'}`}</span>
}

let fetchCount: number
let hebrewDate: string

/** The cache is module-level and outlives a test, so each test needs
 *  coordinates no other test has used. */
let nextLat = 39.9
function freshCoords() {
  nextLat += 0.01
  return { lat: Number(nextLat.toFixed(3)), lng: -75.1652 }
}

/** Lets the fetch's promise chain settle. `waitFor` can't be used here: it
 *  polls on timers, and these tests need fake ones for setSystemTime. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function becomeVisible() {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** useNow's shared clock only resyncs its module-level snapshot when its
 *  first subscriber mounts, so it can still be showing whatever real time was
 *  current when this module first loaded. Left alone, two components that
 *  mount together — exactly this file's "simultaneously-mounted" tests —
 *  can catch that resync mid-flight: the first subscribes and jumps the
 *  clock to the fake day these tests actually want, the second reads it
 *  after the jump, and the two land on different `useToday()` day keys for
 *  what's supposed to be one identical render. That's a test-harness race,
 *  not a real one — in the app the module loads and the first paint happen
 *  the same instant, so the clock is never far enough off to cross a day
 *  boundary — but it needs settling before the fake day is trustworthy here.
 *  A throwaway subscribe-then-unmount forces that resync before the real
 *  render happens. */
function ClockWarmup() {
  useNow()
  return null
}
function resyncClock() {
  act(() => {
    render(<ClockWarmup />)
  })
  cleanup()
}

beforeEach(() => {
  fetchCount = 0
  hebrewDate = '22 Elul 5786'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-16T12:00:00'))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      fetchCount++
      return {
        json: async () => ({
          ok: true,
          data: {
            hebrewDate,
            dayOfWeek: 3,
            isFriday: false,
            isShabbos: false,
            dailyZmanim: [],
            shabbos: { candleLighting: null, havdalah: null },
          },
        }),
      } as unknown as Response
    }),
  )
  resyncClock()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useZmanim', () => {
  it('shares one fetch between two simultaneously-mounted callers for the identical coordinates', async () => {
    const coords = freshCoords()
    render(
      <>
        <Probe testId="a" coords={coords} />
        <Probe testId="b" coords={coords} />
      </>,
    )
    await flush()

    expect(screen.getByTestId('a').textContent).toBe(`ready:${hebrewDate}`)
    expect(screen.getByTestId('b').textContent).toBe(`ready:${hebrewDate}`)
    expect(fetchCount).toBe(1)
  })

  it('reuses the cache on a later mount for the same day and coordinates', async () => {
    const coords = freshCoords()
    render(<Probe testId="a" coords={coords} />)
    await flush()
    const afterFirstMount = fetchCount

    cleanup()
    render(<Probe testId="a" coords={coords} />)
    await flush()

    expect(screen.getByTestId('a').textContent).toBe(`ready:${hebrewDate}`)
    expect(fetchCount).toBe(afterFirstMount)
  })

  it('fetches independently for two different coordinates, never coalescing them', async () => {
    const coordsA = freshCoords()
    const coordsB = freshCoords()
    render(
      <>
        <Probe testId="a" coords={coordsA} />
        <Probe testId="b" coords={coordsB} />
      </>,
    )
    await flush()

    expect(fetchCount).toBe(2)
  })

  it('refetches once the date rolls over, even for the same coordinates', async () => {
    const coords = freshCoords()
    render(<Probe testId="a" coords={coords} />)
    await flush()
    const beforeMidnight = fetchCount

    // The tab sits open past midnight, then is looked at again — which is the
    // moment useNow broadcasts and useToday's snapshot changes.
    hebrewDate = '23 Elul 5786'
    vi.setSystemTime(new Date('2026-09-17T01:00:00'))
    act(() => becomeVisible())
    await flush()

    expect(fetchCount).toBe(beforeMidnight + 1)
    expect(screen.getByTestId('a').textContent).toBe(`ready:${hebrewDate}`)
  })

  it('sets status to error, independently per caller, when the one shared fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCount++
        throw new Error('network down')
      }),
    )
    const coords = freshCoords()
    render(
      <>
        <Probe testId="a" coords={coords} />
        <Probe testId="b" coords={coords} />
      </>,
    )
    await flush()

    expect(screen.getByTestId('a').textContent).toBe('error:—')
    expect(screen.getByTestId('b').textContent).toBe('error:—')
    // Still just the one underlying request, not one per caller.
    expect(fetchCount).toBe(1)
  })

  it('reports "no-location" without fetching at all when coords are null', async () => {
    render(<Probe testId="a" coords={null} />)
    await flush()

    expect(screen.getByTestId('a').textContent).toBe('no-location:—')
    expect(fetchCount).toBe(0)
  })
})
