// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCommunity } from '@/test/providerFixtures'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import type { LocationControls } from '@/components/home/LocationControl'
import SiteHeader from './SiteHeader'

// The natural next target after GenericListingCard for the provider harness
// (renderWithProviders) — this is the component that actually exercises
// useActiveCommunity's setCommunity/router.push (the community switcher),
// rather than just satisfying the mock the way GenericListingCard does.
// Also needs HeaderCollapseProvider (headerVisibility.tsx), composed
// directly around the element passed to renderWithProviders rather than
// baked into the harness itself, since most of the ~12 components this
// harness unlocks don't touch it.

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => {
  cleanup()
  resetMockRouter()
})

function location(overrides: Partial<LocationControls> = {}): LocationControls {
  return {
    address: '',
    coords: null,
    onAddressChange: vi.fn(),
    onCoords: vi.fn(),
    tracking: false,
    geoError: null,
    geoErrorSilent: false,
    onStartTracking: vi.fn(),
    onStopTracking: vi.fn(),
    ...overrides,
  }
}

describe('SiteHeader — a single community', () => {
  it('renders the site name/tagline as one "go home" button, with no switcher', async () => {
    const user = userEvent.setup()
    const onGoHome = vi.fn()
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={onGoHome} location={location()} />
      </HeaderCollapseProvider>,
      { content: { settings: { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', tagline: 'Find what you need' } } },
    )

    expect(screen.getByText('Test Directory')).toBeInTheDocument()
    expect(screen.getByText('Find what you need')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch community' })).not.toBeInTheDocument()

    await user.click(screen.getByText('Test Directory'))
    expect(onGoHome).toHaveBeenCalledTimes(1)
  })
})

describe('SiteHeader — several communities', () => {
  const philly = makeCommunity({ slug: 'philly', name: 'Philadelphia' })
  const baltimore = makeCommunity({ slug: 'baltimore', name: 'Baltimore' })

  it('turns the title into a community switcher', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
      { community: philly, communities: [philly, baltimore] },
    )

    const switcher = screen.getByRole('button', { name: 'Switch community' })
    await user.click(switcher)

    expect(screen.getByRole('button', { name: /Baltimore/ })).toBeInTheDocument()
  })

  it('switching community calls router.push with the new community’s path', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
      { community: philly, communities: [philly, baltimore] },
    )

    await user.click(screen.getByRole('button', { name: 'Switch community' }))
    await user.click(screen.getByRole('button', { name: /Baltimore/ }))

    expect(mockRouter.push).toHaveBeenCalledWith('/baltimore')
  })

  it('clicking the logo still calls onGoHome, separately from the switcher', async () => {
    const user = userEvent.setup()
    const onGoHome = vi.fn()
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={onGoHome} location={location()} />
      </HeaderCollapseProvider>,
      { community: philly, communities: [philly, baltimore] },
    )

    await user.click(screen.getByRole('button', { name: 'Home' }))

    expect(onGoHome).toHaveBeenCalledTimes(1)
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('suppresses the switcher in the admin preview (previewSettings set), even with several communities', () => {
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader
          onGoHome={vi.fn()}
          location={location()}
          previewSettings={{ ...SITE_SETTINGS_DEFAULTS, name: 'Preview Name', tagline: 'Preview Tagline' }}
        />
      </HeaderCollapseProvider>,
      { community: philly, communities: [philly, baltimore] },
    )

    expect(screen.getByText('Preview Name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch community' })).not.toBeInTheDocument()
  })
})
