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
  default: ({ mode, existing, onUp, embedded }: { mode: string; existing?: DirectoryResource; onUp: () => void; embedded?: boolean }) => (
    <div>
      <p>ListingForm stub — mode={mode}, existing={existing?.name}{embedded ? ' (embedded)' : ''}</p>
      <button onClick={onUp}>stub cancel</button>
    </div>
  ),
}))
vi.mock('@/components/resources/ReportListing', () => ({
  default: ({ listing, embedded }: { listing: DirectoryResource; embedded?: boolean }) => (
    <p>ReportListing stub — {listing.name}{embedded ? ' (embedded)' : ''}</p>
  ),
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

  // Regression: the header avatar used to overlay a small category-glyph
  // badge on its own corner whenever a real photo was showing (see git
  // history) — removed at the user's request, so a photo avatar here now
  // renders as a plain circle with nothing else drawn on top of it.
  it('shows the photo avatar with no category-glyph corner badge on top of it', () => {
    const category = makeCategory({ id: 'grocery', label: 'Grocery Store' })
    const item = makeListing({ name: 'Goldi Market', photo: 'https://example.com/goldi.jpg' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    // Not getByRole('img') — CategoryIcon's photo has alt="" (decorative),
    // which drops it from the accessibility tree's img role entirely.
    expect(document.querySelector('img')).toBeInTheDocument()
    expect(document.querySelector('[class*="-right-1.5"][class*="-top-1.5"]')).not.toBeInTheDocument()
  })

  // Same PinnedBadge GenericListingCard/NearbyList put on their own avatars
  // (see each file's identical test) — shows up here too now.
  it('shows a pin badge on the header avatar once the listing is pinned', () => {
    const category = makeCategory({ id: 'grocery', label: 'Grocery Store' })
    const item = makeListing({ id: 'goldi-1', name: 'Goldi Market' })
    localStorage.setItem('jpc:pinned-listings', JSON.stringify([{ id: 'goldi-1', categoryId: 'grocery' }]))

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByText('📌')).toBeInTheDocument()
    localStorage.clear()
  })

  it('shows FreshnessFooter, with Edit/Report/Pin/Share/Set location all behind one kebab in the header', async () => {
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const user = (await import('@testing-library/user-event')).default.setup()

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
    // Edit/Report used to be standalone buttons right under FreshnessFooter
    // — both now live only in the kebab, same place Pin/Share/Set location
    // do (see GenericListingCard's own identical move).
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^report$/i })).not.toBeInTheDocument()

    const kebab = screen.getByRole('button', { name: /more actions for goldi market/i })
    await user.click(kebab)
    expect(screen.getByRole('menuitem', { name: /^pin$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^share$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^report$/i })).toBeInTheDocument()
  })

  it('swaps to the edit form (same one the category directory uses) when Edit is clicked, and back on cancel', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))

    expect(screen.getByText('ListingForm stub — mode=edit, existing=Goldi Market (embedded)')).toBeInTheDocument()
    // Swapped out entirely, not layered on top.
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
    // Stands in for ListingForm's own heading, suppressed by `embedded` —
    // every other Edit/Report surface (ActionDialog, MobileSheet,
    // ReportSheet) shows this same title in its own header.
    expect(screen.getByRole('heading', { name: 'Suggest an edit' })).toBeInTheDocument()
  })

  it('has a visible "Suggest a correction" link that opens the same edit form as the kebab', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={makeListing({ name: 'Goldi Market' })} category={makeCategory()} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Suggest a correction' }))
    expect(screen.getByText('ListingForm stub — mode=edit, existing=Goldi Market (embedded)')).toBeInTheDocument()
  })

  it('shows no "Suggest a correction" link when the category has editing turned off', () => {
    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail
          item={makeListing({ name: 'Goldi Market' })}
          category={makeCategory({ capabilities: { edit: false } })}
          color="#000"
          onBack={() => {}}
        />
      </PinnedProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Suggest a correction' })).not.toBeInTheDocument()
    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
  })

  // Regression: the edit form used to open with no way back at all on
  // mobile — ListingForm's own back affordance (formerly a Breadcrumb,
  // since removed everywhere) never became visible here since MapScreen
  // deliberately collapses the shared header on this screen. Confirmed
  // live before this landed. This button replaces it on BOTH platforms
  // (see this component's own doc on why naming a destination was
  // actually wrong here, not just redundant) — closes the form the same
  // way cancelling it does: via history.back(), not a direct state reset.
  it('shows a Back button once the edit form is open, and it closes the form via history.back()', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))

    await user.click(screen.getByRole('button', { name: /^back$/i }))
    expect(backSpy).toHaveBeenCalled()
  })

  // Report used to open as its own sheet, layered on top of the place
  // detail — moved to the same in-place swap Edit already does (see
  // MapPlaceDetail's own doc): this whole panel already lives inside the
  // map's one persistent bottom sheet, so Report joining Edit inside it
  // reads better than a second sheet stacked on top.
  it('swaps to the report form (same one the category directory uses) when Report is clicked, and back on cancel', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^report$/i }))

    expect(screen.getByText('ReportListing stub — Goldi Market (embedded)')).toBeInTheDocument()
    // Swapped out entirely, not layered on top.
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Report a problem' })).toBeInTheDocument()
  })

  it('shows a Back button once the report form is open, and it closes the form via history.back()', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^report$/i }))

    await user.click(screen.getByRole('button', { name: /^back$/i }))
    expect(backSpy).toHaveBeenCalled()
  })

  it('pushes a history entry when Report opens, so a swipe-back returns here instead of leaving the map', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const pushSpy = vi.spyOn(window.history, 'pushState')

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^report$/i }))

    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ mapSheetForm: 'report' }), '')
  })

  it('hides Edit/Report when the category has turned them off', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const category: CategoryConfig = makeCategory({
      capabilities: { ...CATEGORY_CAPABILITY_DEFAULTS, edit: false, report: false },
    })
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    const kebab = screen.getByRole('button', { name: /more actions for goldi market/i })
    // The kebab (Pin/Share/Set location) stays available regardless — none
    // of those are contribution capabilities.
    expect(kebab).toBeInTheDocument()
    await user.click(kebab)
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^report$/i })).not.toBeInTheDocument()
  })

  it('pushes a history entry when Edit opens, so a swipe-back returns here instead of leaving the map', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const pushSpy = vi.spyOn(window.history, 'pushState')

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))

    expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ mapSheetForm: 'edit' }), '')
  })

  it('returns to the place detail (not the list, not off the map) when a swipe-back fires while the edit form is open', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))
    expect(screen.getByText(/ListingForm stub/)).toBeInTheDocument()

    // Simulates what a real swipe-back/browser-back delivers: a popstate
    // whose state no longer carries mapSheetForm, because history.back()
    // popped past the entry openEdit pushed.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(screen.queryByText(/ListingForm stub/)).not.toBeInTheDocument()
    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
  })

  it('closes the edit form via history.back(), not a direct state reset, so cancelling and swiping back behave identically', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    await user.click(screen.getByRole('button', { name: /more actions for goldi market/i }))
    await user.click(screen.getByRole('menuitem', { name: /^edit$/i }))
    await user.click(screen.getByRole('button', { name: 'stub cancel' }))

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

  // Was self-start (the header row's own default) until this centered
  // against just the name line instead of the whole name+category block —
  // reversed to match GenericListingCard's own kebab, which centers
  // against its full header for the same reason (Material Design: a row's
  // trailing element centers against the row as a whole, not just its
  // first line). Mocked up both options before this landed.
  it('centers the kebab against the whole name+category block, not just the name', () => {
    const category = makeCategory()
    const item = makeListing()

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    const kebab = screen.getByRole('button', { name: /more actions for/i })
    const positioned = kebab.closest('div[class*="mr-1"]')
    expect(positioned).not.toBeNull()
    expect(positioned).toHaveClass('self-center')
  })
})
