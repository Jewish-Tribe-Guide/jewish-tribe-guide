// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useZmanAnchors, geoKey, resolveAnchorTime } from './useZmanAnchors'

// The module-level cache used to be keyed on location alone, on the reasoning
// that zmanim "don't change within a session". A session here is a phone in
// someone's pocket: a tab opened on Thursday evening went on captioning
// Friday's mincha with Thursday's sunset, under the word "today".

function Probe({ geo }: { geo: { lat: number; lng: number } }) {
  const anchors = useZmanAnchors([geo])
  return <span data-testid="sunset">{anchors[geoKey(geo)]?.sunsetIso ?? '—'}</span>
}

let sunsetIso: string
let fetchCount: number

/** The cache is module-level and outlives a test, so each test needs
 *  coordinates no other test has used. */
let nextLat = 39.9
function freshGeo() {
  nextLat += 0.01
  return { lat: Number(nextLat.toFixed(3)), lng: -75.1652 }
}

/** Lets the fetch's promise chain settle. `waitFor` can't be used here: it
 *  polls on timers, and these tests need fake ones for setSystemTime. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function becomeVisible() {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  fetchCount = 0
  sunsetIso = '2026-08-28T19:23:00-04:00'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-28T18:00:00'))
  vi.stubGlobal('fetch', vi.fn(async () => {
    fetchCount++
    return {
      json: async () => ({
        ok: true,
        data: {
          dailyZmanim: [{ label: 'Sunset', iso: sunsetIso }],
          shabbos: { candleLighting: null, havdalah: null },
        },
      }),
    } as unknown as Response
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useZmanAnchors', () => {
  it('fetches once for a location and reuses it within the day', async () => {
    const geo = freshGeo()
    render(<Probe geo={geo} />)
    await flush()
    expect(screen.getByTestId('sunset').textContent).toBe(sunsetIso)
    // Counted relative to whatever the first mount cost rather than as an
    // absolute: the clock's snapshot is seeded at module load, which under
    // fake timers is a different date from the one the test then sets, so the
    // first mount can legitimately settle on the real date and then the faked
    // one. What's being asserted is that a second mount adds nothing.
    const afterFirstMount = fetchCount

    cleanup()
    render(<Probe geo={geo} />)
    await flush()
    // Second mount, same day: served from the module cache, no new request.
    expect(screen.getByTestId('sunset').textContent).toBe(sunsetIso)
    expect(fetchCount).toBe(afterFirstMount)
  })

  it('refetches once the date rolls over', async () => {
    const geo = freshGeo()
    render(<Probe geo={geo} />)
    await flush()
    expect(screen.getByTestId('sunset').textContent).toBe(sunsetIso)
    const beforeMidnight = fetchCount

    // The tab sits open past midnight, then is looked at again — which is the
    // moment useNow broadcasts and useToday's snapshot changes.
    sunsetIso = '2026-08-29T19:21:00-04:00'
    vi.setSystemTime(new Date('2026-08-29T01:00:00'))
    act(() => becomeVisible())
    await flush()

    expect(fetchCount).toBe(beforeMidnight + 1)
    expect(screen.getByTestId('sunset').textContent).toBe(sunsetIso)
  })
})

// ── Bounded rules ─────────────────────────────────────────────────────────────
//
// The shtiebel case: Kabbalas Shabbos at candle lighting, never before 5:00pm
// and never after 7:00pm. Both real Philadelphia candle-lightings below — the
// December one falls under the floor, the June one over the ceiling, and the
// rule is the same single rule on both dates.

describe('resolveAnchorTime with bounds', () => {
  const at = (candleLightingIso: string) => ({ candleLightingIso })
  const rule = { anchor: 'candle_lighting' as const, offsetMinutes: 0 }

  it('shows the real candle lighting when it falls inside the window', () => {
    // Late October — 5:47pm, comfortably between the two bounds.
    expect(
      resolveAnchorTime(
        { ...rule, notBefore: '17:00', notAfter: '19:00' },
        at('2026-10-23T17:47:00-04:00'),
      ),
    ).toBe('5:47 PM')
  })

  it('holds at the floor when candle lighting is earlier', () => {
    // Mid-December — candle lighting is 4:12pm, but the shul never starts
    // before 5:00pm.
    expect(
      resolveAnchorTime(
        { ...rule, notBefore: '17:00', notAfter: '19:00' },
        at('2026-12-18T16:12:00-05:00'),
      ),
    ).toBe('5:00 PM')
  })

  it('holds at the ceiling when candle lighting is later', () => {
    // Late June — candle lighting is 8:13pm, but the shul never starts after
    // 7:00pm. This is the case seasons could not express: it is the same rule
    // as December, not a different one.
    expect(
      resolveAnchorTime(
        { ...rule, notBefore: '17:00', notAfter: '19:00' },
        at('2026-06-26T20:13:00-04:00'),
      ),
    ).toBe('7:00 PM')
  })

  it('is unaffected when a row carries no bounds', () => {
    expect(resolveAnchorTime(rule, at('2026-06-26T20:13:00-04:00'))).toBe('8:13 PM')
  })
})
