// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { makeCommunity } from '@/test/providerFixtures'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'
import { HeaderCollapseProvider, ScreenHeaderProvider, useCollapseHeader, useHeaderOverlay, useSetScreenHeader } from '@/lib/headerVisibility'
import { ForcedViewport } from '@/lib/useIsMobile'
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
  it('renders the site name as one "go home" button, with no switcher', async () => {
    const user = userEvent.setup()
    const onGoHome = vi.fn()
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={onGoHome} location={location()} />
      </HeaderCollapseProvider>,
      { content: { settings: { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', tagline: 'Find what you need' } } },
    )

    expect(screen.getByText('Test Directory')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch community' })).not.toBeInTheDocument()

    await user.click(screen.getByText('Test Directory'))
    expect(onGoHome).toHaveBeenCalledTimes(1)
  })

  // The tagline used to render as a second line under the name — it repeated
  // roughly what the hero's mission line says a few pixels of scroll later.
  // Dropped from the header for that reason (see SiteHeader's own comment);
  // the field itself is untouched (still admin-editable, still set here),
  // it just has no render site left.
  it('no longer renders the tagline — that redundant second line is gone', () => {
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
      { content: { settings: { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory', tagline: 'Find what you need' } } },
    )

    expect(screen.queryByText('Find what you need')).not.toBeInTheDocument()
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

    // A real <Link>, not a <button> — see SiteHeader's own comment on why.
    await user.click(screen.getByRole('link', { name: 'Home' }))

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

function OverlayOn() {
  useHeaderOverlay(true)
  return null
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

describe('SiteHeader — desktop overlay (transparent over the home hero)', () => {
  afterEach(() => setScrollY(0))

  it('is transparent (desktop) when overlaid and not yet scrolled', () => {
    setScrollY(0)
    renderWithProviders(
      <HeaderCollapseProvider>
        <OverlayOn />
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    expect(screen.getByRole('banner')).toHaveClass('desktop:bg-transparent')
  })

  it('goes solid (desktop) once scrolled past the top, even while still overlaid', () => {
    setScrollY(40)
    renderWithProviders(
      <HeaderCollapseProvider>
        <OverlayOn />
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    expect(screen.getByRole('banner')).not.toHaveClass('desktop:bg-transparent')
    expect(screen.getByRole('banner')).toHaveClass('desktop:bg-white')
  })

  it('stays solid (desktop) on a screen that never opts into the overlay', () => {
    setScrollY(0)
    renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    expect(screen.getByRole('banner')).not.toHaveClass('desktop:bg-transparent')
  })

  it('leaves mobile\'s own classes untouched in every state', () => {
    setScrollY(0)
    renderWithProviders(
      <HeaderCollapseProvider>
        <OverlayOn />
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    expect(screen.getByRole('banner')).toHaveClass('bg-white/90')
  })
})

describe('SiteHeader — mobile', () => {
  // On mobile this block only ever renders on the home screen itself — every
  // other screen swaps it for the back button (showScreenHeader) or the
  // header collapses entirely (the map) — so a link back to the page you're
  // already on has nowhere useful to go. Plain text there instead.
  it('the site name is plain text, not a link back to the page you’re already on', async () => {
    const user = userEvent.setup()
    const onGoHome = vi.fn()
    renderWithProviders(
      <HeaderCollapseProvider>
        <ForcedViewport isMobile>
          <SiteHeader onGoHome={onGoHome} location={location()} />
        </ForcedViewport>
      </HeaderCollapseProvider>,
      { content: { settings: { ...SITE_SETTINGS_DEFAULTS, name: 'Test Directory' } } },
    )

    expect(screen.getByText('Test Directory')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Test Directory' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test Directory' })).not.toBeInTheDocument()

    await user.click(screen.getByText('Test Directory'))
    expect(onGoHome).not.toHaveBeenCalled()
  })

  // Regression coverage for the `compact` prop LocationControl used to take
  // (SiteHeader passed `compact={showScreenHeader}`, collapsing the "Set
  // location" text to just the pin icon on every non-home mobile screen).
  // That's gone now — the prompt should show in full wherever the pill
  // renders, on mobile, until a location is actually set.
  it('still shows the "Set location" prompt in full on a category screen, not just the icon', () => {
    function DirectoryScreenStandIn() {
      useSetScreenHeader(true, 'Grocery', vi.fn())
      return null
    }

    renderWithProviders(
      <HeaderCollapseProvider>
        <ScreenHeaderProvider>
          <ForcedViewport isMobile>
            <DirectoryScreenStandIn />
            <SiteHeader onGoHome={vi.fn()} location={location()} />
          </ForcedViewport>
        </ScreenHeaderProvider>
      </HeaderCollapseProvider>,
    )

    expect(screen.getByText('Set location')).not.toHaveClass('hidden')
  })
})

// Regression coverage for: on the mobile map, tapping the map's own pin
// button — which opens LocationControl's popover while the header is
// collapsed (see that component's own doc) — visibly did nothing. The
// popover really was opening; it just could never paint above the map's own
// fullscreen `z-50` layer (ResourceMapView.tsx), no matter its own z-index
// (confirmed live: not even z-index: 9999 helped). The cause was this
// header's `viewTransitionName` — a *named* one forces Chromium to promote
// the element to its own paint layer that wins against ordinary z-index
// unconditionally, not just during an active transition — and it was set
// unconditionally, including while collapsed, when the header has no
// visible content left for a transition to protect. jsdom can't exercise
// the paint/stacking bug itself; this asserts the one property the real fix
// touches — see SiteHeader.tsx's own doc for how this was diagnosed.
function Collapser() {
  useCollapseHeader(true)
  return null
}

describe('SiteHeader — collapsed (mobile map)', () => {
  it('carries no view-transition-name while collapsed — a named one would win against the map\'s own z-50 layer no matter its own z-index', () => {
    const { container } = renderWithProviders(
      <HeaderCollapseProvider>
        <Collapser />
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    const header = container.querySelector('header')!
    expect(header.style.viewTransitionName).toBe('none')
  })

  it('still carries the view-transition-name when not collapsed, so the slide transition still has a stable layer to anchor to', () => {
    const { container } = renderWithProviders(
      <HeaderCollapseProvider>
        <SiteHeader onGoHome={vi.fn()} location={location()} />
      </HeaderCollapseProvider>,
    )

    const header = container.querySelector('header')!
    expect(header.style.viewTransitionName).toBe('site-header')
  })
})
