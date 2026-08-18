import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeTravelTimesFrom } from './travelTime'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function distanceMatrixResponse(statuses: ('OK' | 'ZERO_RESULTS')[], seconds: number[]) {
  return {
    ok: true,
    json: async () => ({
      status: 'OK',
      rows: [
        {
          elements: statuses.map((status, i) => ({
            status,
            ...(status === 'OK' ? { duration: { value: seconds[i] } } : {}),
          })),
        },
      ],
    }),
  }
}

const origin = { lat: 40, lng: -75 }
const destinations = [
  { id: 'a', lat: 40.1, lng: -75.1 },
  { id: 'b', lat: 40.2, lng: -75.2 },
]

describe('computeTravelTimesFrom', () => {
  it('returns {} without calling fetch when GOOGLE_MAPS_SERVER_KEY is unset', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeTravelTimesFrom(origin, destinations)

    expect(result).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns {} without calling fetch when there are no destinations', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeTravelTimesFrom(origin, [])

    expect(result).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('merges drive and walk minutes per destination, rounded from seconds', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      // 600s -> 10 min, 900s -> 15 min (driving); 1800s -> 30 min, 2700s -> 45 min (walking)
      if (url.includes('mode=driving')) return distanceMatrixResponse(['OK', 'OK'], [600, 900])
      return distanceMatrixResponse(['OK', 'OK'], [1800, 2700])
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeTravelTimesFrom(origin, destinations)

    expect(result).toEqual({
      a: { drive: 10, walk: 30 },
      b: { drive: 15, walk: 45 },
    })
  })

  it('omits whichever mode Google could not route, keeping the one that succeeded', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('mode=driving')) return distanceMatrixResponse(['ZERO_RESULTS'], [0])
      return distanceMatrixResponse(['OK'], [600])
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeTravelTimesFrom(origin, [destinations[0]])

    expect(result).toEqual({ a: { walk: 10 } })
  })

  it('drops a destination entirely when neither mode could route it', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(distanceMatrixResponse(['ZERO_RESULTS'], [0])))

    const result = await computeTravelTimesFrom(origin, [destinations[0]])

    expect(result).toEqual({})
  })

  it('treats an HTTP failure as unknown (empty result) rather than throwing', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))

    const result = await computeTravelTimesFrom(origin, destinations)

    expect(result).toEqual({})
  })

  it('treats a network error as unknown (empty result) rather than throwing', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await computeTravelTimesFrom(origin, destinations)

    expect(result).toEqual({})
  })

  it('chunks destinations into batches of 25 per Distance Matrix request', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, lat: 40, lng: -75 }))
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const count = decodeURIComponent(url.split('destinations=')[1].split('&')[0]).split('|').length
      return distanceMatrixResponse(
        Array(count).fill('OK'),
        Array(count).fill(600),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await computeTravelTimesFrom(origin, many)

    // 2 chunks (25 + 5) x 2 modes (driving/walking) = 4 requests.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(Object.keys(result)).toHaveLength(30)
  })
})
