// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddressInput from './AddressInput'

const mockMapsAuthFailed = vi.hoisted(() => vi.fn(() => false))
const mockOnMapsAuthFailure = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('@/lib/loadGoogleMaps', () => ({
  MAPS_API_KEY: 'test-key',
  mapsAuthFailed: mockMapsAuthFailed,
  onMapsAuthFailure: mockOnMapsAuthFailure,
}))

const mockFetchAddressSuggestions = vi.hoisted(() => vi.fn())
const mockResetAutocompleteSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/placesAutocomplete', () => ({
  fetchAddressSuggestions: mockFetchAddressSuggestions,
  resetAutocompleteSession: mockResetAutocompleteSession,
}))

function makeSuggestion(overrides: Partial<{ placeId: string; mainText: string; secondaryText: string; types: string[]; placeOverrides: Record<string, unknown> }> = {}) {
  const placeId = overrides.placeId ?? 'place-1'
  const place = {
    id: placeId,
    formattedAddress: '123 Main St, Philadelphia, PA',
    location: { lat: () => 39.95, lng: () => -75.16 },
    displayName: 'Test Shul',
    fetchFields: vi.fn().mockResolvedValue(undefined),
    ...overrides.placeOverrides,
  }
  return {
    // Every Google business/POI result's own types list includes
    // 'establishment' — see AddressInput's own selectSuggestion, which reads
    // this to decide whether a preferPlaceName caller should get the place's
    // name or its formatted address. Defaulted on here since most existing
    // tests are exercising a business-suggestion scenario ("Test Shul");
    // tests specifically about the establishment/address distinction pass
    // their own `types`.
    prediction: { placeId, types: overrides.types ?? ['establishment'], toPlace: () => place },
    mainText: overrides.mainText ?? 'Test Shul',
    secondaryText: overrides.secondaryText ?? 'Philadelphia, PA',
  }
}

// Real timers throughout: userEvent's own internal waiting doesn't play well
// with fake timers, and the component's 200ms debounce is short enough to
// just wait out for real.
function waitOutDebounce() {
  return new Promise((r) => setTimeout(r, 300))
}

afterEach(() => {
  cleanup()
  mockMapsAuthFailed.mockReset().mockReturnValue(false)
  mockOnMapsAuthFailure.mockReset().mockReturnValue(() => {})
  mockFetchAddressSuggestions.mockReset()
  mockResetAutocompleteSession.mockReset()
})

describe('AddressInput', () => {
  it('debounces typed input before fetching suggestions, then renders them', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([makeSuggestion()])
    const onChange = vi.fn()

    render(<AddressInput value="" onChange={onChange} />)
    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')

    expect(mockFetchAddressSuggestions).not.toHaveBeenCalled()
    await waitOutDebounce()

    await waitFor(() => expect(screen.getByText('Test Shul')).toBeInTheDocument())
    expect(screen.getByText('Philadelphia, PA')).toBeInTheDocument()
  })

  it('clears stale coordinates the moment the user types again after a prior selection', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([])
    const onCoords = vi.fn()

    render(<AddressInput value="123 Main St" onChange={vi.fn()} onCoords={onCoords} />)
    await user.type(screen.getByPlaceholderText('Address or location'), 'x')

    expect(onCoords).toHaveBeenCalledWith(null)
  })

  it('never fetches suggestions when disableAutocomplete is set (deterministic, offline-safe field)', async () => {
    const user = userEvent.setup()
    render(<AddressInput value="" onChange={vi.fn()} disableAutocomplete />)

    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')
    await waitOutDebounce()

    expect(mockFetchAddressSuggestions).not.toHaveBeenCalled()
  })

  it('never fetches suggestions once Google auth has failed, even with a key present', async () => {
    mockMapsAuthFailed.mockReturnValue(true)
    const user = userEvent.setup()
    render(<AddressInput value="" onChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')
    await waitOutDebounce()

    expect(mockFetchAddressSuggestions).not.toHaveBeenCalled()
  })

  it('selecting a suggestion fills the formatted address by default, not the place name', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([makeSuggestion()])
    const onChange = vi.fn()
    const onCoords = vi.fn()

    render(<AddressInput value="" onChange={onChange} onCoords={onCoords} />)
    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('Test Shul')).toBeInTheDocument())

    await user.click(screen.getByText('Test Shul'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('123 Main St, Philadelphia, PA'))
    expect(onCoords).toHaveBeenCalledWith({ lat: 39.95, lng: -75.16 })
    expect(mockResetAutocompleteSession).toHaveBeenCalled()
  })

  it('with preferPlaceName, fills the place name instead of the formatted address for a business/POI result', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([makeSuggestion({ types: ['establishment'] })])
    const onChange = vi.fn()

    render(<AddressInput value="" onChange={onChange} preferPlaceName />)
    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('Test Shul')).toBeInTheDocument())
    await user.click(screen.getByText('Test Shul'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Test Shul'))
  })

  // Regression test: Google's Places API returns a `displayName` for plain
  // street addresses too, not just businesses — and it can be a shorter,
  // abbreviated echo of what was typed (e.g. "232 S 15th St") rather than
  // the full `formattedAddress` ("232 South 15th Street, Philadelphia, PA
  // 19102, USA"). preferPlaceName used to swap in `displayName` whenever it
  // was merely present, which silently truncated the address the "Set
  // location" header control saved. Gating on the prediction's own `types`
  // (a plain address never includes 'establishment') fixes it.
  it('with preferPlaceName, still fills the FULL formatted address for a plain address result, even though it has a displayName', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([
      makeSuggestion({
        types: ['street_address', 'geocode'],
        mainText: '232 S 15th St',
        placeOverrides: { displayName: '232 S 15th St', formattedAddress: '232 South 15th Street, Philadelphia, PA 19102, USA' },
      }),
    ])
    const onChange = vi.fn()

    render(<AddressInput value="" onChange={onChange} preferPlaceName />)
    await user.type(screen.getByPlaceholderText('Address or location'), '232 S 15th')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('232 S 15th St')).toBeInTheDocument())
    await user.click(screen.getByText('232 S 15th St'))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('232 South 15th Street, Philadelphia, PA 19102, USA'))
  })

  it('passes structured place details to onPlaceSelect when a business/POI is chosen', async () => {
    const user = userEvent.setup()
    const suggestion = makeSuggestion({
      placeOverrides: {
        displayName: 'Test Shul',
        nationalPhoneNumber: '(215) 555-0100',
        regularOpeningHours: { periods: [] },
        websiteURI: 'https://example.com',
        editorialSummary: 'A local shul.',
      },
    })
    mockFetchAddressSuggestions.mockResolvedValue([suggestion])
    const onPlaceSelect = vi.fn()

    render(<AddressInput value="" onChange={vi.fn()} onPlaceSelect={onPlaceSelect} />)
    await user.type(screen.getByPlaceholderText('Address or location'), '123 Main')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('Test Shul')).toBeInTheDocument())
    await user.click(screen.getByText('Test Shul'))

    await waitFor(() =>
      expect(onPlaceSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          placeId: 'place-1',
          name: 'Test Shul',
          phone: '(215) 555-0100',
          website: 'https://example.com',
          description: 'A local shul.',
        }),
      ),
    )
  })

  it('shows a clear button only once there is a value, and clearing resets value/coords/dropdown', async () => {
    const onChange = vi.fn()
    const onCoords = vi.fn()
    const { rerender } = render(<AddressInput value="" onChange={onChange} onCoords={onCoords} />)
    expect(screen.queryByLabelText('Clear')).not.toBeInTheDocument()

    rerender(<AddressInput value="123 Main St" onChange={onChange} onCoords={onCoords} />)
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Clear'))

    expect(onChange).toHaveBeenCalledWith('')
    expect(onCoords).toHaveBeenCalledWith(null)
  })

  it('supports arrow-key navigation and Enter to select the highlighted suggestion', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([
      makeSuggestion({ placeId: 'p1', mainText: 'First Place' }),
      makeSuggestion({ placeId: 'p2', mainText: 'Second Place' }),
    ])
    const onChange = vi.fn()

    render(<AddressInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Address or location')
    await user.type(input, '123 Main')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('First Place')).toBeInTheDocument())

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    // Wrapped back to the first item after two downs from -1 (0, 1 -> wraps at length 2 -> 0... actually -1+1=0, 0+1=1)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('123 Main St, Philadelphia, PA'))
  })

  it('Escape closes the dropdown without selecting anything', async () => {
    const user = userEvent.setup()
    mockFetchAddressSuggestions.mockResolvedValue([makeSuggestion()])
    const onChange = vi.fn()

    render(<AddressInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Address or location')
    await user.type(input, '123 Main')
    await waitOutDebounce()
    await waitFor(() => expect(screen.getByText('Test Shul')).toBeInTheDocument())

    await user.keyboard('{Escape}')

    expect(screen.queryByText('Test Shul')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalledWith('123 Main St, Philadelphia, PA')
  })
})
