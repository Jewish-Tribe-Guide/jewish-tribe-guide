// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCategory } from '@/test/providerFixtures'
import { mockRouter } from '@/test/nextNavigationMock'
import { emitPosition, mockGeolocation, resetMockGeolocation } from '@/test/geolocationMock'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/siteSettings'
import SiteChrome from './SiteChrome'

// SiteChrome wraps every public screen: header, footer, mobile tab bar, and
// the location/pinned/dropped-pins providers they all share — it owns all of
// those itself (LocationProvider, PinnedProvider, DroppedPinsProvider,
// HeaderCollapseProvider are internal), so renderWithProviders only needs to
// supply CommunityProvider/ContentProvider on top, same as everything else.

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  resetMockGeolocation()
  localStorage.clear()
})

describe('SiteChrome', () => {
  it('renders the header, the page content, and the mobile tab bar', () => {
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
      { content: { settings: { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory' } } },
    )

    // "Test Directory" renders in both the header and the footer.
    expect(screen.getAllByText('Test Directory').length).toBeGreaterThan(0)
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByText('Categories')).toBeInTheDocument()
    expect(screen.getByText('Feedback')).toBeInTheDocument()
  })

  it('does not show the Map tab when the community has no Map pseudo-category', () => {
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
      { content: { categories: [makeCategory({ id: 'grocery', kind: 'listing' })] } },
    )

    expect(screen.queryByText('Map')).not.toBeInTheDocument()
  })

  it('shows the Map tab once the community has a Map pseudo-category', () => {
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
      { content: { categories: [makeCategory({ id: 'map', kind: 'map' })] } },
    )

    expect(screen.getByText('Map')).toBeInTheDocument()
  })

  it('shows nothing from ContentFailureNotice when nothing failed', () => {
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a failure notice naming what failed to load', () => {
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
      { content: { failed: ['categories'] } },
    )

    expect(screen.getByRole('status')).toHaveTextContent(/couldn.t load the list of categories/)
  })

  it('shows the "share your location" prompt on a fresh visit, and dismisses on "Not now"', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
    )

    expect(await screen.findByText('Share your live location?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByText('Share your live location?')).not.toBeInTheDocument()
    expect(localStorage.getItem('jpc:live-location-prompt')).not.toBeNull()
  })

  it('sharing location starts the live GPS watch', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SiteChrome year={2026}>
        <p>Page content</p>
      </SiteChrome>,
    )

    await user.click(await screen.findByRole('button', { name: 'Share my location' }))

    expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('jpc:live-tracking-enabled')).toBe('1')

    // A GPS tick updating the shared location doesn't crash the tree — the
    // prompt itself, at least, should be gone now that tracking is on.
    act(() => emitPosition({ lat: 40, lng: -75 }))
    expect(screen.queryByText('Share your live location?')).not.toBeInTheDocument()
  })
})
