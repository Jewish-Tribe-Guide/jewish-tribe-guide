// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommunityProvider } from '@/lib/communityContext'
import { LocationProvider } from '@/lib/locationContext'
import { HeaderCollapseProvider } from '@/lib/headerVisibility'
import { makeCommunity } from '@/test/providerFixtures'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'
import MapScreen from './MapScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community/map',
  useSearchParams: () => new URLSearchParams(),
}))

// ResourceMapView pulls in the real Google Maps SDK and a full listings/
// categories stack — its own concern, exhaustively tested in
// ResourceMapView.test.tsx. What's under test here is MapScreen's own
// exitToPreviousScreen wiring, so it's stubbed down to just the one prop
// that matters: a button that fires onExitFullscreenToListing, the same way
// Escape/the fullscreen-toggle button do on the real component.
vi.mock('@/components/map/ResourceMapView', () => ({
  default: ({ onExitFullscreenToListing }: { onExitFullscreenToListing?: () => void }) => (
    <button onClick={onExitFullscreenToListing}>Exit fullscreen</button>
  ),
}))

afterEach(() => {
  cleanup()
  resetMockRouter()
})

function renderMapScreen() {
  const community = makeCommunity({ slug: 'test-community' })
  return render(
    <CommunityProvider community={community} communities={[community]}>
      <LocationProvider>
        <HeaderCollapseProvider>
          <MapScreen />
        </HeaderCollapseProvider>
      </LocationProvider>
    </CommunityProvider>,
  )
}

// Exiting the fullscreen map (Escape, or the fullscreen-toggle button) used
// to always navigate home. The user's own call: it should go back to
// whatever screen was actually open before the map came up instead — a
// category directory's own "Map" button, the header nav, the hero's "View
// Map", the mobile tab bar, all lead here, so there's no one fixed "parent"
// screen to hardcode.
describe('MapScreen — exiting fullscreen', () => {
  it('goes back to the previous screen when there is browser history to return to', async () => {
    const user = userEvent.setup()
    renderMapScreen()
    Object.defineProperty(window.history, 'length', { value: 2, configurable: true })

    await user.click(screen.getByRole('button', { name: 'Exit fullscreen' }))

    expect(mockRouter.back).toHaveBeenCalledTimes(1)
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  // A map link opened directly (bookmark, shared link, new tab) is the
  // first entry in its own history — router.back() would be a no-op there,
  // leaving the visitor stuck in fullscreen with the header covered and no
  // way out. Falls back to home instead.
  it('falls back to home when there is no previous screen to go back to', async () => {
    const user = userEvent.setup()
    renderMapScreen()
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true })

    await user.click(screen.getByRole('button', { name: 'Exit fullscreen' }))

    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', { transitionTypes: undefined })
  })
})
