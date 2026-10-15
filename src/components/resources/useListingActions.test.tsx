// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import * as locationContext from '@/lib/locationContext'
import { ui } from '@/lib/uiConfig'
import { useListingActions } from './useListingActions'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/uiConfig', () => ({ ui: { map: { pins: true } } }))

// useShareLink has its own unit test for the native-share-vs-clipboard logic.
vi.mock('@/lib/useShareLink', () => ({
  useShareLink: () => ({ share: vi.fn(), copied: false }),
}))

vi.mock('@/lib/locationContext', async () => {
  const actual = await vi.importActual<typeof import('@/lib/locationContext')>('@/lib/locationContext')
  return { ...actual, useOptionalLocation: vi.fn() }
})

// The gating used to be tested through ListingActionsFan, its main renderer,
// and went with it when the fan was deleted (Oct 15). The hook still drives
// the row's swipe panel, so its rules are tested here, on the hook, rather
// than through any one way of drawing them.
function Actions({ item, category }: { item: ReturnType<typeof makeListing>; category: ReturnType<typeof makeCategory> }) {
  const actions = useListingActions(item, category, '/philly/grocery/goldi-a1b2c3')
  return (
    <>
      {actions.map((a) => (
        <button key={a.id} data-active={a.active || undefined} onClick={a.onSelect}>
          {a.label}
        </button>
      ))}
    </>
  )
}

function renderActions(
  categoryOverrides: Parameters<typeof makeCategory>[0] = {},
  listing: Parameters<typeof makeListing>[0] = {},
) {
  const item = makeListing({ id: 'listing-1', name: 'Goldi Market', geo: { lat: 39.95, lng: -75.16 }, ...listing })
  renderWithProviders(<Actions item={item} category={makeCategory(categoryOverrides)} />)
}

function withLocation(overrides: { anchorListingId?: string | null; setListingAnchor?: () => void; unsetListingAnchor?: () => void } = {}) {
  vi.mocked(locationContext.useOptionalLocation).mockReturnValue({
    anchorListingId: null,
    setListingAnchor: vi.fn(),
    unsetListingAnchor: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof locationContext.useOptionalLocation>)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // usePinned is backed by real localStorage, and every test uses the same id.
  localStorage.clear()
  ui.map.pins = true
})

describe('useListingActions', () => {
  it('offers Save, Share and Set as location for a placed, geocoded listing', () => {
    withLocation()
    renderActions()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Save', 'Share', 'Set as location'])
  })

  it('drops Save when the community has saving off', () => {
    withLocation()
    ui.map.pins = false
    renderActions()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('reads "Saved" once saved', () => {
    withLocation()
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('data-active', 'true')
  })

  it('drops Set as location for a category with no physical place', () => {
    withLocation()
    renderActions({ hasAddress: false })
    expect(screen.queryByRole('button', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('drops Set as location when there is no location provider at all', () => {
    vi.mocked(locationContext.useOptionalLocation).mockReturnValue(null)
    renderActions()
    expect(screen.queryByRole('button', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('drops Set as location for a listing whose address never geocoded', () => {
    withLocation()
    renderActions({}, { geo: undefined })
    expect(screen.queryByRole('button', { name: /set as location/i })).not.toBeInTheDocument()
  })

  it('sets this listing as the location', () => {
    const setListingAnchor = vi.fn()
    withLocation({ setListingAnchor })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Set as location' }))
    expect(setListingAnchor).toHaveBeenCalledWith({ id: 'listing-1', name: 'Goldi Market', coords: { lat: 39.95, lng: -75.16 } })
  })

  it('reads "Location set" when this listing is already the location, and unsets it', () => {
    const unsetListingAnchor = vi.fn()
    withLocation({ anchorListingId: 'listing-1', unsetListingAnchor })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Location set' }))
    expect(unsetListingAnchor).toHaveBeenCalledTimes(1)
  })
})
