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

function renderHarness() {
  const community = makeCommunity({ slug: 'test-community' })
  render(
    <CommunityProvider community={community} communities={[community]}>
      <OpenFlowHarness />
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
