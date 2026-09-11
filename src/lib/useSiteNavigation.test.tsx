// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockRouter, resetMockRouter } from '@/test/nextNavigationMock'

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/test-community',
  useSearchParams: () => new URLSearchParams(),
}))

// useSiteNavigation only needs useCommunitySlug (community.slug) — no
// ContentProvider, no full renderWithProviders stack.
import { CommunityProvider } from '@/lib/communityContext'
import { makeCommunity } from '@/test/providerFixtures'
import { useSiteNavigation } from './useSiteNavigation'

// A thin harness exposing openFlow as a button click — useSiteNavigation is
// a hook, not a component, so this is the plain way to drive it under RTL.
function OpenFlowHarness() {
  const { openFlow } = useSiteNavigation()
  return <button onClick={() => openFlow('volunteer')}>Open</button>
}

// Same pattern for goHome — two buttons, one bare (the tab bar/logo case)
// and one carrying a transitionType (the category directory's own back
// arrow), matching how SlugScreen.tsx actually calls this.
function GoHomeHarness() {
  const { goHome } = useSiteNavigation()
  return (
    <>
      <button onClick={() => goHome()}>Home</button>
      <button onClick={() => goHome({ transitionTypes: ['nav-back'] })}>Back</button>
    </>
  )
}

function renderHarness() {
  const community = makeCommunity({ slug: 'test-community' })
  render(
    <CommunityProvider community={community} communities={[community]}>
      <OpenFlowHarness />
    </CommunityProvider>,
  )
}

function renderGoHomeHarness() {
  const community = makeCommunity({ slug: 'test-community' })
  render(
    <CommunityProvider community={community} communities={[community]}>
      <GoHomeHarness />
    </CommunityProvider>,
  )
}

afterEach(() => {
  cleanup()
  resetMockRouter()
})

describe('useSiteNavigation — openFlow', () => {
  it('pushes a plain slug URL', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community/volunteer')
  })
})

// goHome's transitionTypes passthrough is what lets SlugScreen's own back
// arrow request the mobile directional slide (see navTransitions.ts /
// globals.css's .nav-back rule) without every other way of landing on home
// — the tab bar, the header logo — also carrying it and triggering a
// browser view-transition with no matching exit animation on their own
// screen (see goHome's own comment on why that's specifically avoided).
describe('useSiteNavigation — goHome', () => {
  it('passes no transitionTypes for a bare goHome() call', async () => {
    const user = userEvent.setup()
    renderGoHomeHarness()

    await user.click(screen.getByRole('button', { name: 'Home' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', { transitionTypes: undefined })
  })

  it('passes transitionTypes through when the caller supplies them', async () => {
    const user = userEvent.setup()
    renderGoHomeHarness()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/test-community', { transitionTypes: ['nav-back'] })
  })
})
