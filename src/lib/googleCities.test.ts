import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findCity, suggestCities } from './googleCities'

// Shaped like Google's answers for "Balti" and Baltimore, MD (Nov 25).
const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'k')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
const answer = (body: object) => fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body })

describe('suggestCities', () => {
  it('asks for cities only and gives each one’s name and where it is', async () => {
    answer({
      status: 'OK',
      predictions: [
        { place_id: 'p1', description: 'Baltimore, MD, USA', structured_formatting: { main_text: 'Baltimore', secondary_text: 'MD, USA' } },
        { place_id: 'p2', description: 'Baltimore, OH, USA', structured_formatting: { main_text: 'Baltimore', secondary_text: 'OH, USA' } },
      ],
    })
    expect(await suggestCities('Balti')).toEqual([
      { placeId: 'p1', city: 'Baltimore', area: 'MD, USA' },
      { placeId: 'p2', city: 'Baltimore', area: 'OH, USA' },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain('types=(cities)')
  })

  it('tells "no such city" from "Google isn’t answering"', async () => {
    answer({ status: 'ZERO_RESULTS' })
    expect(await suggestCities('zzzz')).toEqual([])
    answer({ status: 'REQUEST_DENIED' })
    expect(await suggestCities('Balti')).toBeNull()
  })
})

describe('findCity', () => {
  it('gives the city, its state written out, and its centre', async () => {
    answer({
      status: 'OK',
      result: {
        name: 'Baltimore',
        geometry: { location: { lat: 39.29, lng: -76.61 } },
        address_components: [
          { long_name: 'Baltimore', types: ['locality', 'political'] },
          { long_name: 'Maryland', types: ['administrative_area_level_1', 'political'] },
          { long_name: 'United States', types: ['country', 'political'] },
        ],
      },
    })
    expect(await findCity('p1')).toEqual({ city: 'Baltimore', area: 'Maryland', lat: 39.29, lng: -76.61 })
  })

  it('falls back to the country where there is no state', async () => {
    answer({
      status: 'OK',
      result: { name: 'London', geometry: { location: { lat: 51.5, lng: -0.12 } }, address_components: [{ long_name: 'London', types: ['locality'] }, { long_name: 'United Kingdom', types: ['country'] }] },
    })
    expect(await findCity('p9')).toMatchObject({ city: 'London', area: 'United Kingdom' })
  })

  it('is null for a place with no location', async () => {
    answer({ status: 'OK', result: { name: 'Nowhere' } })
    expect(await findCity('p0')).toBeNull()
  })
})
