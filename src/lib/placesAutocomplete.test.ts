import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAddressSuggestions, NEAR_RADIUS_M, resetAutocompleteSession } from './placesAutocomplete'

vi.mock('./loadGoogleMaps', () => ({ loadGoogleMaps: async () => {} }))

// Google's request itself: a place near the community comes before one of
// the same name elsewhere (Oct 6, "Paulie Gee" in Brooklyn before
// Philadelphia's), by leaning toward it rather than limiting to it.
describe('fetchAddressSuggestions', () => {
  const fetchSuggestions = vi.fn<(req: Record<string, unknown>) => Promise<{ suggestions: never[] }>>(async () => ({ suggestions: [] }))
  vi.stubGlobal('google', {
    maps: {
      importLibrary: async () => ({
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions: fetchSuggestions },
      }),
    },
  })
  afterEach(() => {
    fetchSuggestions.mockClear()
    resetAutocompleteSession()
  })

  it('leans toward the community’s centre when given one', async () => {
    await fetchAddressSuggestions('Paulie Gee', { near: { lat: 39.95, lng: -75.17 } })
    expect(fetchSuggestions.mock.calls[0][0]).toMatchObject({ input: 'Paulie Gee', locationBias: { center: { lat: 39.95, lng: -75.17 }, radius: NEAR_RADIUS_M } })
    expect(fetchSuggestions.mock.calls[0][0]).not.toHaveProperty('locationRestriction')
    expect(NEAR_RADIUS_M).toBeLessThanOrEqual(50_000)
  })

  it('asks as before without one', async () => {
    await fetchAddressSuggestions('Paulie Gee', { near: null })
    expect(fetchSuggestions.mock.calls[0][0]).not.toHaveProperty('locationBias')
  })
})
