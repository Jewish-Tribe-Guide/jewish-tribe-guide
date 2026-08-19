// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory, makeListing } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { PinnedProvider } from '@/lib/pinnedContext'
import MapPlaceDetail from './MapPlaceDetail'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/map',
  useSearchParams: () => new URLSearchParams(),
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
