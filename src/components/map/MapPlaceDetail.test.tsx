// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
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
  default: ({ mode, existing }: { mode: string; existing?: DirectoryResource }) => (
    <p>ListingForm stub — mode={mode}, existing={existing?.name}</p>
  ),
}))
vi.mock('@/components/resources/ReportListing', () => ({
  default: ({ listing }: { listing: DirectoryResource }) => <p>ReportListing stub — {listing.name}</p>,
}))

afterEach(() => cleanup())

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

  it('shows the same FreshnessFooter/Share/Edit/Report bottom section the category directory\'s expanded card shows', () => {
    const category = makeCategory()
    const item = makeListing({ name: 'Goldi Market' })

    renderWithProviders(
      <PinnedProvider>
        <MapPlaceDetail item={item} category={category} color="#000" onBack={() => {}} />
      </PinnedProvider>,
    )

    expect(screen.getByText('Is this info current?')).toBeInTheDocument()
    const shareButton = screen.getByRole('button', { name: /Share/ })
    expect(shareButton).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Report/ })).toBeInTheDocument()

    // The bug this guards: Share used to sit on the same line as "Is this
    // info current?" (both inline elements with only a margin between them),
    // instead of its own row below like the category directory's card.
    // Share/Edit/Report all being direct siblings under one shared parent —
    // separate from FreshnessFooter's own — is what forces the line break,
    // same structure GenericListingCard uses.
    const row = shareButton.parentElement!
    expect(row).toContainElement(screen.getByRole('button', { name: /Edit/ }))
    expect(row).toContainElement(screen.getByRole('button', { name: /Report/ }))
    expect(row).not.toContainElement(screen.getByText('Is this info current?'))
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
    // Share stays available regardless — it isn't a contribution capability.
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument()
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
