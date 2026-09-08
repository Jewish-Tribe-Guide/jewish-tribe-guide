// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { PinnedProvider } from '@/lib/pinnedContext'
import { CATEGORY_CAPABILITY_DEFAULTS, type CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import MapPlaceDetail from './MapPlaceDetail'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/map',
  useSearchParams: () => new URLSearchParams(),
}))

// ListingForm/ReportListing are the same forms the category directory's own
// Edit/Report use (see GenericListingCard) — already covered by their own
// test files. Stubbed here to just prove MapPlaceDetail swaps to the right
// one with the right listing, not to re-exercise their internals (which
// pull in the real Google Maps address widget, Turnstile, etc.).
vi.mock('@/components/resources/ListingForm', () => ({
  default: ({ mode, existing, onUp }: { mode: string; existing?: DirectoryResource; onUp: () => void }) => (
    <div>
      <p>ListingForm stub — mode={mode}, existing={existing?.name}</p>
      <button onClick={onUp}>stub cancel</button>
    </div>
  ),
}))
vi.mock('@/components/resources/ReportListing', () => ({
  default: ({ listing }: { listing: DirectoryResource }) => <p>ReportListing stub — {listing.name}</p>,
}))

afterEach(() => {
  cleanup()
  // The push/pop history tests leave real entries behind (jsdom's History
  // is a live, module-level object, not reset between tests) — back to a
  // clean slate so one test's pushState can't leak into the next one's
  // "was anything pushed" assertions.
  window.history.replaceState(null, '')
})

describe('MapPlaceDetail', () => {
  it('links the name to the listing\'s own canonical category-page URL', () => {
    const category = makeCategory({ id: 'grocery', label: 'Grocery Store' })
    const item = makeListing({ id: 'abc123def456', name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
      { community: { slug: 'test-community' } },
    )

    const link = screen.getByRole('link', { name: 'Goldi Market' })
    expect(link).toHaveAttribute('href', '/test-community/grocery/goldi-market-abc123')
  })

  it('shows the same FreshnessFooter/Edit/Report bottom section the category directory\'s expanded card shows, plus a Pin/Share/Set location kebab in the header', async () => {
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const user = (await import('@testing-library/user-event')).default.setup()

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
    const editButton = screen.getByRole('button', { name: /Edit/ })
    expect(editButton).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Report/ })).toBeInTheDocument()

    // The bug this used to guard: Share (now in the kebab below, not a
    // footer sibling any more) used to sit on the same line as "Is this
    // info current?" instead of its own row below. Edit/Report being direct
    // siblings under one shared parent — separate from FreshnessFooter's
    // own — is what still forces that line break, same structure
    // GenericListingCard uses.
    const row = editButton.parentElement!
    expect(row).toContainElement(screen.getByRole('button', { name: /Report/ }))
    expect(row).not.toContainElement(screen.getByText('Is this info current?'))

    // Pin/Share/"Set location" — same kebab GenericListingCard's own card
    // shows, restated here since this panel has no separate collapsed card
    // of its own to put one on.
    const kebab = screen.getByRole('button', { name: /more actions for goldi market/i })
    await user.click(kebab)
    expect(screen.getByRole('menuitem', { name: /^pin$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^share$/i })).toBeInTheDocument()
  })

  it('swaps to the edit form (same one the category directory uses) when Edit is clicked, and back on cancel', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Edit/ }))

    expect(screen.getByText('ListingForm stub — mode=edit, existing=Goldi Market')).toBeInTheDocument()
    // Swapped out entirely, not layered on top.
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
  })

  it('swaps to the report form when Report is clicked', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Report/ }))

    expect(screen.getByText('ReportListing stub — Goldi Market')).toBeInTheDocument()
  })

  it('hides Edit/Report when the category has turned them off', () => {
    const category: CategoryConfig = makeCategory({
      capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, edit: false, report: false },
    })
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Report/ })).not.toBeInTheDocument()
    // The kebab (Pin/Share/Set location) stays available regardless — none
    // of those are contribution capabilities.
    expect(screen.getByRole('button', { name: /more actions for goldi market/i })).toBeInTheDocument()
  })

  it('pushes a history entry when Edit opens, so a swipe-back returns here instead of leaving the map', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const pushSpy = vi.spyOn(window.history, 'pushState')

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Edit/ }))

    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ mapSheetForm: 'edit' }), '')
  })

  it('returns to the place detail (not the list, not off the map) when a swipe-back fires while the edit form is open', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Edit/ }))
    expect(screen.getByText(/ListingForm stub/)).toBeInTheDocument()

    // Simulates what a real swipe-back/browser-back delivers: a popstate
    // whose state no longer carries mapSheetForm, because history.back()
    // popped past the entry openAction pushed.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(screen.queryByText(/ListingForm stub/)).not.toBeInTheDocument()
    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
  })

  it('closes the edit form via history.back(), not a direct state reset, so cancelling and swiping back behave identically', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'stub cancel' }))

    expect(backSpy).toHaveBeenCalled()
    // Mocked no-op above, so no popstate actually fired — the form staying
    // put confirms the component didn't ALSO reset its own state directly,
    // only delegated to the browser.
    expect(screen.getByText(/ListingForm stub/)).toBeInTheDocument()
  })

  it('calls onBack when the back button is clicked', async () => {
    const onBack = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const category = makeCategory()
    const item = makeListing()

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={onBack} />
      </PinnedProvider>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to list' }))
    expect(onBack).toHaveBeenCalled()
  })
})
