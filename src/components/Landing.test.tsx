// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import Landing from './Landing'

// HomeMap and ZmanimStrip are mocked out — both pull in real network/SDK
// dependencies of their own (Google Maps, the uncached /api/zmanim fetch)
// that are their own components' concerns, not Landing's. What's under test
// here is Landing's own composition/filtering logic: which sections render,
// whether typing narrows the grid, and whether the map/zmanim bands appear
// only when the community actually has those pseudo-categories.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/home/HomeMap', () => ({
  default: () => <div data-testid="home-map-stub" />,
}))
vi.mock('@/components/home/ZmanimStrip', () => ({
  default: () => <div data-testid="zmanim-strip-stub" />,
}))

afterEach(() => cleanup())

const handlers = {
  onNavigate: vi.fn(),
  onOpenFlow: vi.fn(),
  onViewAllCategories: vi.fn(),
  coords: null,
  liveTracking: { tracking: false, error: null, start: vi.fn(), stop: vi.fn() },
  controls: {
    address: '',
    onAddressChange: vi.fn(),
    onCoords: vi.fn(),
    tracking: false,
    geoError: null,
    geoErrorSilent: false,
    onStartTracking: vi.fn(),
    onStopTracking: vi.fn(),
  },
}

describe('Landing', () => {
  it('shows the configured hero title/mission and the category grid', () => {
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    renderWithProviders(<Landing {...handlers} />, {
      content: {
        categories: [grocery],
        settings: { ...SITE_SETTINGS_DEFAULTS, heroTitle: 'Welcome to the directory', mission: 'Everything nearby' },
      },
    })

    expect(screen.getByText('Welcome to the directory')).toBeInTheDocument()
    expect(screen.getByText('Everything nearby')).toBeInTheDocument()
    expect(screen.getAllByText('Grocery Stores').length).toBeGreaterThan(0)
  })

  it('narrows the grid to matching cards when typing, and hides the rest', async () => {
    const user = userEvent.setup()
    const grocery = makeCategory({ id: 'grocery', pluralLabel: 'Grocery Stores' })
    const synagogue = makeCategory({ id: 'synagogue', pluralLabel: 'Synagogues' })
    renderWithProviders(<Landing {...handlers} />, { content: { categories: [grocery, synagogue] } })

    await user.type(screen.getByLabelText('Filter resources'), 'grocery')

    expect(screen.getByText('Grocery Stores')).toBeInTheDocument()
    expect(screen.queryByText('Synagogues')).not.toBeInTheDocument()
  })

  it('shows a "nothing matches" message for a query with no hits', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Landing {...handlers} />, { content: { categories: [makeCategory()] } })

    await user.type(screen.getByLabelText('Filter resources'), 'xyznotreal')

    expect(screen.getByText(/Nothing matches “xyznotreal”/)).toBeInTheDocument()
  })

  it('renders the map band only when the community has a Map pseudo-category', () => {
    const withMap = makeCategory({ id: 'map', kind: 'map', pluralLabel: 'Map' })
    const { unmount } = renderWithProviders(<Landing {...handlers} />, { content: { categories: [withMap] } })
    expect(screen.getByTestId('home-map-stub')).toBeInTheDocument()
    unmount()

    renderWithProviders(<Landing {...handlers} />, { content: { categories: [makeCategory()] } })
    expect(screen.queryByTestId('home-map-stub')).not.toBeInTheDocument()
  })

  it('renders the zmanim strip only when the community has a zmanim pseudo-category', () => {
    const withZmanim = makeCategory({ id: 'zmanim', kind: 'zmanim', pluralLabel: 'Zmanim' })
    const { unmount } = renderWithProviders(<Landing {...handlers} />, { content: { categories: [withZmanim] } })
    expect(screen.getByTestId('zmanim-strip-stub')).toBeInTheDocument()
    unmount()

    renderWithProviders(<Landing {...handlers} />, { content: { categories: [makeCategory()] } })
    expect(screen.queryByTestId('zmanim-strip-stub')).not.toBeInTheDocument()
  })

  it('calls onViewAllCategories when "Browse all categories" is clicked', async () => {
    const user = userEvent.setup()
    const onViewAllCategories = vi.fn()
    renderWithProviders(<Landing {...handlers} onViewAllCategories={onViewAllCategories} />, {
      content: { categories: [makeCategory()] },
    })

    await user.click(screen.getByRole('button', { name: /Browse all categories/ }))

    expect(onViewAllCategories).toHaveBeenCalledTimes(1)
  })
})
